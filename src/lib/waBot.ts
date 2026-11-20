/** The WhatsApp chatbot engine — turns one inbound customer message into:
 *  an updated conversation, a logged message, zero or more Automation
 *  History events, and (depending on Chatbot Settings) an auto-reply, a
 *  lead/draft-quote, a handover, or nothing at all.
 *
 *  Design notes (read before changing the flow):
 *  · This is a RULE-BASED bot — keyword FAQ matching + a slot-filling state
 *    machine for collecting travel/baggage details, NOT an LLM/NLU engine.
 *    That's a deliberate choice: the task's hard rule is "never invent a
 *    price/policy", and a free-form language model answering FAQ questions
 *    from its own knowledge would risk doing exactly that. Upgrading the
 *    FAQ/parsing step to a real LLM later is possible but is a new
 *    paid-API + data-flow decision that needs the owner's explicit sign-off
 *    first — not something to slip in silently.
 *  · Every send to the customer in THIS file goes via sendWhatsApp()
 *    directly (free-form text), never through the automation.ts outbox,
 *    because a conversational reply only works at all within WhatsApp's
 *    24h customer-service window — which is guaranteed here, since the
 *    customer just messaged us. The one exception is handing off to an
 *    already-wired lifecycle template (inquiry_ack / quote_ready) via
 *    notify()+kickSweep(), reusing its existing idempotency/outbox/retry
 *    machinery instead of duplicating it.
 *  · Dedup reuses the exact rule src/app/api/admin/leads/route.ts already
 *    uses in production (open CRM lead by last-10-digit mobile) — see
 *    findOpenLeadByMobile below — so a WhatsApp-sourced lead and an
 *    ads-imported lead can never silently double-book the same customer. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsApp, sendWhatsAppButtons, fetchWhatsAppMedia, notify, kickSweep, opsNotify, looksLikeTestName } from "./automation";
import { loadMasters } from "./pricingSettings";
import { makeQuotedBooking } from "./quoteFactory";
import { addMessage, attachMessageMedia, getConversation, logEvent, normalizeMobile, registerSentMessageMapping, saveConversation } from "./waStore";
import { newToken } from "./supabaseAdmin";
import { loadWaConfig } from "./waConfig";
import type { CrmActivity } from "./types";
import type { WaConversation, WaConfig } from "./waTypes";

type SB = SupabaseClient;

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const nowIso = () => new Date().toISOString();

export interface InboundInput {
  mobile: string;        // raw, any format Meta sends (wa_id digits, country code included)
  waId?: string;
  profileName?: string;
  text: string;          // for mediaType messages, a human-readable placeholder (e.g. "[Photo]") built by the webhook route, not Meta's own payload
  wamid: string;
  timestamp?: string;    // Meta's unix seconds string, if present
  /** set when this message is a photo/document/voice note/location/etc
   *  instead of text — e.g. "photo", "document", "voice message",
   *  "location". The bot can't read any of these, so it hands over to a
   *  human immediately rather than guessing (see handleInboundMessage). */
  mediaType?: string;
  /** Meta's media id (image/document/video/audio messages only) — used to
   *  download the actual attachment for the admin UI's thumbnail/preview
   *  (fetchWhatsAppMedia). Absent for location/sticker/text. */
  mediaId?: string;
}

/* ================= dedup — mirrors leads/route.ts's open-lead-by-mobile rule ================= */
async function findOpenLeadByMobile(sb: SB, mobile10: string): Promise<CrmActivity | null> {
  const { data: rows } = await sb.from("crm").select("doc");
  const open = (rows ?? []).map((r) => r.doc as CrmActivity)
    .filter((a) => a.kind === "lead" && a.stage && !["won", "lost"].includes(a.stage))
    .find((a) => (a.mobile ?? "").replace(/\D/g, "").slice(-10) === mobile10);
  return open ?? null;
}

/* ================= tiny text understanding — deliberately simple, see file header ================= */
export function isOptOut(text: string): boolean {
  return /^\s*(stop|unsubscribe|opt\s*out|cancel\s*all)\s*\.?\s*$/i.test(text.trim());
}

export function matchesAny(text: string, phrases: string[]): string | null {
  const t = text.toLowerCase();
  return phrases.find((p) => t.includes(p.toLowerCase())) ?? null;
}

export function matchFaq(text: string, faq: WaConfig["faq"]): WaConfig["faq"][number] | null {
  const t = text.toLowerCase().replace(/[^\w\s]/g, " ");
  const words = new Set(t.split(/\s+/).filter((w) => w.length >= 4));
  if (!words.size) return null;
  let best: { entry: WaConfig["faq"][number]; score: number } | null = null;
  for (const entry of faq) {
    const qWords = entry.question.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
    if (!qWords.length) continue;
    const hits = qWords.filter((w) => words.has(w)).length;
    const score = hits / qWords.length;
    // require BOTH a strong overlap ratio AND at least 2 shared significant
    // words (unless the question only has one) — one incidental shared word
    // (e.g. "bags") must never fire an FAQ answer over a real booking-detail
    // message like "3 bags Mumbai to Pune".
    if (score >= 0.6 && hits >= Math.min(2, qWords.length) && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

const BAG_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Best-effort extraction of from/to city, bag count and a free-text date
 *  from one message, against the LIVE city list (loadMasters) so a lane the
 *  pricing engine doesn't even know about is never half-matched. Returns
 *  only what it's reasonably sure of — never guesses a city from a partial
 *  word. */
export function extractFields(text: string, cityNames: string[]): { fromName?: string; toName?: string; bags?: number; date?: string } {
  const out: { fromName?: string; toName?: string; bags?: number; date?: string } = {};
  const lower = text.toLowerCase();

  const findCity = (hay: string): string | undefined =>
    cityNames.find((c) => hay.includes(c.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim()));

  const arrowMatch = text.match(/([A-Za-z\s]+?)\s*(?:to|->|→)\s*([A-Za-z\s]+)/i);
  if (arrowMatch) {
    const f = findCity(arrowMatch[1].toLowerCase());
    const t = findCity(arrowMatch[2].toLowerCase());
    if (f) out.fromName = f;
    if (t) out.toName = t;
  }
  if (!out.fromName && !out.toName) {
    // fall back to "any two known cities appear somewhere in this message, in order"
    const found: string[] = [];
    for (const c of cityNames) {
      const idx = lower.indexOf(c.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim());
      if (idx >= 0) found.push(c);
    }
    if (found.length >= 2) { out.fromName = found[0]; out.toName = found[1]; }
    else if (found.length === 1 && !out.fromName) out.fromName = found[0];
  }

  const numMatch = text.match(/\b(\d{1,2})\s*(bags?|pieces?|suitcases?|luggage)?\b/i);
  if (numMatch) out.bags = Math.min(50, parseInt(numMatch[1], 10));
  else {
    const wordHit = Object.keys(BAG_WORDS).find((w) => new RegExp(`\\b${w}\\b`, "i").test(text) && /bags?|pieces?|suitcases?/i.test(text));
    if (wordHit) out.bags = BAG_WORDS[wordHit];
  }

  const dateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/) || text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (dateMatch) out.date = dateMatch[0];
  else if (/\btoday\b/i.test(text)) out.date = "today";
  else if (/\btomorrow\b/i.test(text)) out.date = "tomorrow";

  return out;
}

const GUIDED_PROMPTS = false;

function promptFor(step: NonNullable<WaConversation["botContext"]>["step"]): string {
  switch (step) {
    case "await_from": return "Which city should we pick your bags up from?";
    case "await_to": return "And which city are the bags going to?";
    case "await_bags": return "How many bags/pieces in total?";
    case "await_date": return "What's the travel/pickup date? (You can also just reply \"not sure yet\" and skip this.)";
    case "await_name": return "Lastly, what name should we book this under?";
    default: return "Could you share your pickup city, drop city and number of bags?";
  }
}

/** `buttons`, when given (max 3, WhatsApp's own limit), sends an
 *  interactive quick-reply message instead of plain text — e.g. an FAQ
 *  answer offering a one-tap "Talk to a human". The row id is generated
 *  BEFORE sending specifically so a successful send's wamid can be mapped
 *  back to it (registerSentMessageMapping), letting the delivery-status
 *  webhook put a real sent/delivered/read tick on this exact bubble later. */
async function send(sb: SB, mobile: string, mobile10: string, text: string, buttons?: { id: string; title: string }[]): Promise<void> {
  const rowId = newToken("WAM", 8);
  let waId: string | undefined;
  try {
    const res = buttons?.length ? await sendWhatsAppButtons(mobile, text, buttons) : await sendWhatsApp(mobile, text);
    waId = res.waId;
  } finally {
    await addMessage(sb, { conversationId: mobile10, direction: "out", text, from: "bot", waId, buttons, at: nowIso() }, rowId);
    if (waId) await registerSentMessageMapping(sb, waId, rowId);
  }
}

/** The automatic acknowledgement (welcome / thank-you) goes out ONCE per customer thread.
 *  Customers who send several messages in a row ("hi", "how are you", "2 bags") must not get
 *  the same canned reply again and again — after the first one, the team replies by hand. */
function alreadyAcknowledged(conv: WaConversation): boolean {
  return !!(conv.autoAckSentAt || conv.botContext);
}
async function sendThankYouOnce(sb: SB, conv: WaConversation, cfg: WaConfig, mobile: string, mobile10: string): Promise<void> {
  if (alreadyAcknowledged(conv)) { await saveConversation(sb, conv); return; }
  conv.autoAckSentAt = nowIso();
  await saveConversation(sb, conv);
  await send(sb, mobile, mobile10, cfg.thankYouMessage);
}

async function handover(sb: SB, conv: WaConversation, cfg: WaConfig, reason: string, customerMobile: string, tellCustomer = true): Promise<void> {
  conv.state = "human";
  conv.handoverReason = reason;
  conv.updatedAt = nowIso();
  await saveConversation(sb, conv);
  await logEvent(sb, { type: "handover", conversationId: conv.mobile, leadId: conv.leadId, bookingId: conv.bookingId, detail: `Handed over to a human — ${reason}`, at: nowIso() });
  const alertMobile = cfg.alertMobile, alertEmail = cfg.alertEmail;
  const text = `WhatsApp handover · ${conv.name ?? conv.mobile} (${conv.mobile}) — ${reason}. Reply from Live Conversations in WhatsApp Chatbot & Automation.`;
  if (alertMobile || alertEmail) {
    if (alertMobile) await notify("ops_alert", { name: "Bagdrop WA desk", mobile: alertMobile }, { text, subject: "WhatsApp handover" }, `wahandover:${conv.mobile}:${Date.now()}`);
    if (alertEmail) await notify("ops_alert", { name: "Bagdrop WA desk", email: alertEmail }, { text, subject: "WhatsApp handover" }, `wahandover:${conv.mobile}:${Date.now()}:em`);
    kickSweep();
  } else {
    await opsNotify(text, "WhatsApp handover", `wahandover:${conv.mobile}`);
  }
  if (tellCustomer && cfg.autoRepliesEnabled) await send(sb, customerMobile, conv.mobile, "Got it — I'm connecting you with our team, they'll reply here shortly. For anything urgent, call +91 63 5711 5711.");
}

/** Entry point — called once per inbound Meta "messages[]" entry, from the
 *  extended /api/hooks/whatsapp route. Best-effort throughout: a thrown
 *  error here must never take down the webhook's 200 OK (Meta retries for
 *  hours otherwise) — the caller wraps this in try/catch and logs an
 *  "error" event on failure. */
export async function handleInboundMessage(sb: SB, input: InboundInput): Promise<void> {
  const mobile10 = normalizeMobile(input.mobile);
  if (mobile10.length !== 10) return; // not a real mobile — nothing to do

  const cfg = await loadWaConfig();
  const existing = await getConversation(sb, mobile10);
  const nowStr = nowIso();
  const conv: WaConversation = existing ?? {
    mobile: mobile10, state: "bot", createdAt: nowStr, updatedAt: nowStr,
  };
  const isNew = !existing;
  conv.waId = input.waId ?? conv.waId;
  if (input.profileName && !conv.name) conv.name = input.profileName;
  conv.lastInboundAt = nowStr;
  conv.lastMessagePreview = input.text.slice(0, 160);
  conv.unread = true;
  conv.updatedAt = nowStr;

  /* idempotency barrier: Meta retries a webhook delivery for hours until it
   * gets a 200. If this exact wamid was already logged, every side effect
   * below (auto-reply, lead creation, handover) has already run once for
   * it — stop here, don't run them again. */
  const firstTimeSeen = await addMessage(sb, { conversationId: mobile10, direction: "in", text: input.text, from: "customer", waId: input.wamid, at: nowStr }, input.wamid);
  if (!firstTimeSeen) return;
  await logEvent(sb, { type: "message_in", conversationId: mobile10, leadId: conv.leadId, bookingId: conv.bookingId, detail: `Inbound: "${input.text.slice(0, 120)}"`, at: nowStr }, `wae:in:${input.wamid}`);

  /* download the actual attachment for a real thumbnail in the admin UI —
   * best-effort and never blocks/affects anything below: a failed/skipped
   * download just leaves the row with its "[Photo]"-style placeholder
   * text only, same as before this existed. Private Storage, same
   * pattern as identity-docs/claim photos elsewhere in this app. */
  if (input.mediaId) {
    const file = await fetchWhatsAppMedia(input.mediaId);
    if (file) {
      const ext = file.contentType.split("/")[1]?.split(";")[0] || "bin";
      const path = `${mobile10}/${input.wamid}.${ext}`;
      await sb.storage.createBucket("wa-media", { public: false }).catch(() => null);
      const up = await sb.storage.from("wa-media").upload(path, file.bytes, { contentType: file.contentType, upsert: false });
      if (!up.error) await attachMessageMedia(sb, input.wamid, path, file.contentType);
    }
  }

  /* opt-out is permanent-until-they-message-again-and-an-admin-clears-it —
   * checked before anything else, and short-circuits the whole flow. */
  if (isOptOut(input.text)) {
    conv.optedOut = true;
    await saveConversation(sb, conv);
    await logEvent(sb, { type: "opt_out", conversationId: mobile10, detail: "Customer opted out (STOP) — automation paused for this number.", at: nowStr });
    await send(sb, input.mobile, mobile10, "You've been unsubscribed from automated messages. Reply anytime to reach our team directly, or call +91 63 5711 5711.");
    return;
  }
  if (conv.optedOut) {
    // they messaged again after opting out — treat as a human conversation, no automation, but don't re-subscribe them to anything automatically
    conv.state = "human";
    await saveConversation(sb, conv);
    return;
  }

  if (conv.state === "resolved") conv.state = "bot"; // a new message reopens a resolved thread

  if (conv.state === "human") {
    await saveConversation(sb, conv); // just record it; admin handles the reply from Live Conversations
    return;
  }

  if (!cfg.chatbotEnabled) { await saveConversation(sb, conv); return; }

  /* a photo/document/voice note/location — the bot can't read any of these
   * (a payment-screenshot amount, a packed-bag photo, a voice note) and
   * guessing would be worse than asking a human to look. Routing, not an
   * auto-reply, so this runs even if autoRepliesEnabled is off — same as
   * the keyword/dissatisfaction handover just below. */
  if (input.mediaType) { await handover(sb, conv, cfg, `customer sent a ${input.mediaType} — the bot can't read attachments, this needs a human to look at it in WhatsApp directly`, input.mobile); return; }

  /* explicit "talk to a human" / dissatisfaction keywords — routing, not an
   * auto-reply, so this runs even if autoRepliesEnabled is off. */
  const kw = matchesAny(input.text, cfg.handoverRules.keywordTriggers);
  const bad = matchesAny(input.text, cfg.handoverRules.dissatisfactionKeywords);
  if (kw || bad) { await handover(sb, conv, cfg, kw ? `customer asked for ${kw}` : `possible dissatisfaction ("${bad}")`, input.mobile); return; }

  if (!cfg.autoRepliesEnabled) { await saveConversation(sb, conv); return; }

  /* already has a lead/booking linked — don't re-run collection, don't ask
   * again for anything we already have (hard rule). A reply here also
   * stops any pending automated follow-up for this conversation (hard
   * rule: follow-ups stop on reply). */
  if (conv.leadId || conv.bookingId) {
    conv.followUp = null;
    await sendThankYouOnce(sb, conv, cfg, input.mobile, mobile10);
    return;
  }

  /* an open lead for this mobile already exists from another channel
   * (website, ads import, a phone call logged in CRM) — link to it
   * immediately rather than asking the customer to repeat details we
   * already have (hard rule: never double-quote/double-book a mobile). */
  const existingOpenLead = await findOpenLeadByMobile(sb, mobile10);
  if (existingOpenLead) {
    conv.leadId = existingOpenLead.id;
    conv.bookingId = existingOpenLead.refId;
    await saveConversation(sb, conv);
    await logEvent(sb, { type: "lead_linked", conversationId: mobile10, leadId: existingOpenLead.id, bookingId: existingOpenLead.refId, detail: "An open lead already exists for this mobile (another channel) — linked instead of asking again.", at: nowIso() });
    await sendThankYouOnce(sb, conv, cfg, input.mobile, mobile10);
    return;
  }

  /* brand-new conversation: send the (admin-editable) welcome message once,
   * then wait for their next reply before trying to parse anything — this
   * matches the welcome text's own instruction ("share your details here"). */
  if (isNew) {
    conv.botContext = { step: "await_from" };
    conv.autoAckSentAt = nowIso();
    await saveConversation(sb, conv);
    await send(sb, input.mobile, mobile10, cfg.welcomeMessage);
    await logEvent(sb, { type: "welcome_sent", conversationId: mobile10, detail: "Sent the welcome message.", at: nowIso() });
    return;
  }

  const faqHit = matchFaq(input.text, cfg.faq);
  if (faqHit) {
    // never repeat the same FAQ answer on a thread
    if ((conv.faqSent ?? []).includes(faqHit.question)) { await saveConversation(sb, conv); return; }
    conv.faqSent = [...(conv.faqSent ?? []), faqHit.question];
    await saveConversation(sb, conv);
    // a one-tap way out of the FAQ loop — clicking it lands back here as
    // plain text ("Talk to a human"), which the keyword-handover check
    // above already matches, so no special button-id handling is needed.
    await send(sb, input.mobile, mobile10, faqHit.answer, [{ id: "talk_to_human", title: "Talk to a human" }]);
    await logEvent(sb, { type: "faq_answered", conversationId: mobile10, detail: `FAQ: "${faqHit.question}"`, at: nowIso() });
    return;
  }

  /* ---------------- slot-filling: collect travel/baggage details ---------------- */
  const masters = await loadMasters();
  const cityNames = masters.cities.map((c) => c.name);
  const extracted = extractFields(input.text, cityNames);
  const ctx = { ...(conv.botContext ?? {}) };
  let gotSomethingNew = false;
  if (extracted.fromName && !ctx.fromName) { ctx.fromName = extracted.fromName; gotSomethingNew = true; }
  if (extracted.toName && !ctx.toName) { ctx.toName = extracted.toName; gotSomethingNew = true; }
  if (extracted.bags && !ctx.bags) { ctx.bags = extracted.bags; gotSomethingNew = true; }
  if (extracted.date && !ctx.date) { ctx.date = extracted.date; gotSomethingNew = true; }
  if (!ctx.name && input.profileName) ctx.name = input.profileName;

  ctx.attempts = gotSomethingNew ? 0 : (ctx.attempts ?? 0) + 1;
  conv.botContext = ctx;

  if (!gotSomethingNew && ctx.attempts > cfg.handoverRules.maxUnparsedTurns) {
    // silent handover: alert the team, but send the customer no further automatic message
    await handover(sb, conv, cfg, "couldn't understand the customer's replies after a few tries", input.mobile, false);
    return;
  }

  const missing: ("await_from" | "await_to" | "await_bags")[] = [];
  if (!ctx.fromName) missing.push("await_from");
  if (!ctx.toName) missing.push("await_to");
  if (!ctx.bags) missing.push("await_bags");

  if (missing.length) {
    ctx.step = missing[0];
    conv.botContext = ctx;
    await saveConversation(sb, conv);
    /* One automatic reply only: the welcome message already asked for the details, so the bot
     * does NOT fire a follow-up question on every message ("Which city…?" over and over). It
     * keeps parsing silently; once details are complete it creates the lead, and if the
     * customer keeps writing without usable details the existing maxUnparsedTurns rule hands
     * the thread to the team. Flip to true to bring back one-question-at-a-time prompting
     * (each prompt is still sent at most once). */
    if (GUIDED_PROMPTS) {
      const asked = ctx.asked ?? [];
      if (!asked.includes(missing[0])) {
        ctx.asked = [...asked, missing[0]];
        conv.botContext = ctx;
        await saveConversation(sb, conv);
        await send(sb, input.mobile, mobile10, promptFor(missing[0]));
        await logEvent(sb, { type: "auto_reply", conversationId: mobile10, detail: `Asked for: ${missing[0].replace("await_", "")}`, at: nowIso() });
      }
    }
    return;
  }

  /* we have fromName + toName + bags — enough to dedup + (maybe) quote */
  ctx.step = "done";
  conv.botContext = ctx;

  const openLead = await findOpenLeadByMobile(sb, mobile10);
  if (openLead) {
    conv.leadId = openLead.id;
    conv.bookingId = openLead.refId;
    await saveConversation(sb, conv);
    await logEvent(sb, { type: "lead_linked", conversationId: mobile10, leadId: openLead.id, bookingId: openLead.refId, detail: "An open lead already exists for this mobile — linked instead of creating a new one.", at: nowIso() });
    await sendThankYouOnce(sb, conv, cfg, input.mobile, mobile10);
    return;
  }

  if (!cfg.autoLeadCreationEnabled) {
    await sendThankYouOnce(sb, conv, cfg, input.mobile, mobile10);
    return;
  }

  const name = ctx.name || conv.name || "Bagdrop customer";
  const { doc, ror, total } = await makeQuotedBooking({
    name, mobile: input.mobile, fromName: ctx.fromName!, toName: ctx.toName!, bags: ctx.bags!, date: ctx.date, source: "whatsapp",
  });
  if (looksLikeTestName(name)) {
    // QA/test traffic through the real bot code path — save the booking so
    // the flow is provably real, but never notify a human or send the
    // customer a message, same convention automation.ts already uses.
    const { error: bkErr } = await sb.from("bookings").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
    if (!bkErr) {
      conv.bookingId = doc.id;
      await saveConversation(sb, conv);
      await logEvent(sb, { type: "lead_created", conversationId: mobile10, bookingId: doc.id, detail: "Test booking created (QA traffic — no customer message sent).", at: nowIso() });
    }
    return;
  }

  const { error: bkErr } = await sb.from("bookings").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
  if (bkErr) {
    await logEvent(sb, { type: "error", conversationId: mobile10, detail: "Failed to save the WhatsApp-sourced booking.", error: bkErr.message, at: nowIso() });
    await handover(sb, conv, cfg, "a technical error creating the booking", input.mobile);
    return;
  }

  const lead: CrmActivity = {
    id: `CRM-A-${doc.id.slice(-8)}`, created: nowIso(), kind: "lead",
    stage: ror ? "new" : "quoted",
    text: `Lead · ${name} (${ctx.fromName} → ${ctx.toName}) · via WhatsApp`,
    value: ror ? 0 : total, mobile: input.mobile, contact: input.mobile,
    source: "whatsapp", campaign: undefined,
    route: { from: ctx.fromName!, to: ctx.toName!, bags: ctx.bags!, date: ctx.date },
    ratePending: ror || undefined,
    quoteInfo: ror ? undefined : { qid: doc.quote.qid, total, validUntil: doc.quote.validUntil ?? undefined, link: `/q/${doc.id}` },
    refId: doc.id, followKey: `wabot:${doc.id}`,
  };
  await sb.from("crm").upsert({ id: lead.id, doc: lead, status: null, created: lead.created });

  conv.leadId = lead.id;
  conv.bookingId = doc.id;
  conv.followUp = cfg.automatedFollowUpsEnabled
    ? { stage: 0, nextAt: new Date(Date.now() + cfg.followUp.delayHours * 3600_000).toISOString() }
    : null;
  await saveConversation(sb, conv);
  await logEvent(sb, { type: "lead_created", conversationId: mobile10, leadId: lead.id, bookingId: doc.id, detail: `Lead created from WhatsApp · ${ctx.fromName} → ${ctx.toName} · ${ctx.bags} bag(s)${ror ? " · RATE ON REQUEST" : ` · auto-quoted ${inr(total)}`}`, at: nowIso() });

  if (ror) {
    if (cfg.handoverRules.onRateOnRequest) { await handover(sb, conv, cfg, "this route isn't on the rate chart — pricing needs a human", input.mobile); return; }
    await sendThankYouOnce(sb, conv, cfg, input.mobile, mobile10);
    return;
  }

  await logEvent(sb, { type: "quote_drafted", conversationId: mobile10, leadId: lead.id, bookingId: doc.id, detail: `Draft quote ${doc.quote.qid} · ${inr(total)} · awaiting admin review in Shipments`, at: nowIso() });

  if (cfg.quoteAutomation.autoSendQuoteEnabled) {
    await notify("quote_ready", { name, mobile: input.mobile }, { lane: `${ctx.fromName} → ${ctx.toName}`, ref: doc.id, amount: inr(total), link: `/q/${doc.id}` }, `wabotquote:${doc.id}`);
    kickSweep();
    await logEvent(sb, { type: "quote_sent", conversationId: mobile10, leadId: lead.id, bookingId: doc.id, detail: `Quote sent automatically (admin has auto-send ON) · ${inr(total)}`, at: nowIso() });
  } else {
    await sendThankYouOnce(sb, conv, cfg, input.mobile, mobile10);
  }
}
