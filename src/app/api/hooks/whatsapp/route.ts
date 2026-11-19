import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { OutboxDoc } from "@/lib/automation";
import { handleInboundMessage } from "@/lib/waBot";
import { addMessage, logEvent, normalizeMobile, updateMessageStatusByWamid } from "@/lib/waStore";

/** WhatsApp Cloud API webhook — TWO jobs on one URL/subscription, since Meta
 *  only ever lets you register one webhook per app for the "messages" field
 *  and delivers both kinds of event to it:
 *
 *  1. Delivery-status callbacks (sent/delivered/read/failed) for OUR sends —
 *     the /messages endpoint's "accepted" response is not proof of
 *     delivery: a free-form text outside the 24h session window, or a
 *     template Meta later flags, both come back 200 OK and then vanish with
 *     nothing in the API response to show for it. This records Meta's own
 *     callback against the outbox row it belongs to, so the Automation desk
 *     shows the true state instead of just "we handed it to Meta". (This
 *     half of the file is unchanged from before the chatbot module.)
 *  2. INCOMING customer messages (2026-11-19, WhatsApp Chatbot & Automation
 *     module) — routed to src/lib/waBot.ts, which owns everything from
 *     here: FAQ auto-replies, collecting travel/baggage details, lead
 *     dedup + draft-quote creation, follow-up scheduling and human
 *     handover. This route itself stays a thin, best-effort dispatcher.
 *  3. Forwarding every status payload on to bagdrop-web's own
 *     /api/whatsapp/webhook (see forwardStatusToBagdropWeb below) — this
 *     webhook replaced that one as Meta's single registered callback, so
 *     without this, bagdrop-web's own delivery-status lookup
 *     (app/api/admin/bookings/[id]/send-whatsapp's GET) would go stale.
 *     Zero code changes on bagdrop-web's side; it just keeps receiving the
 *     exact same payloads it always did, one hop later.
 *
 *  Register this URL (https://<domain>/api/hooks/whatsapp) in Meta's App
 *  dashboard → WhatsApp → Configuration → Webhook, subscribed to the
 *  "messages" field, with WHATSAPP_WEBHOOK_VERIFY_TOKEN set to whatever
 *  verify token you type into that same dashboard field. Optionally also
 *  set META_WHATSAPP_APP_SECRET (the Meta App's "App secret", not the
 *  WhatsApp access token) to verify Meta's X-Hub-Signature-256 on every
 *  POST — recommended once this route can create leads/bookings, not just
 *  update an existing outbox row; without it the route still works
 *  (signature check is skipped, same graceful-degradation convention as
 *  automation.ts's providers), it's just unauthenticated. */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "VERIFICATION_FAILED" }, { status: 403 });
}

type StatusEvent = { id?: string; status?: string; errors?: { title?: string; message?: string }[] };
type MediaPayload = { id?: string; caption?: string; filename?: string };
type ButtonReply = { id?: string; title?: string };
type IncomingMessage = {
  id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string };
  image?: MediaPayload; document?: MediaPayload; video?: MediaPayload; audio?: MediaPayload; sticker?: MediaPayload;
  location?: { name?: string; address?: string };
  /** a reply to an older-style template quick-reply button. */
  button?: { text?: string; payload?: string };
  /** a reply to one of OUR OWN interactive messages (sendWhatsAppButtons in
   *  automation.ts) — button_reply for a button, list_reply for a list. */
  interactive?: { type?: string; button_reply?: ButtonReply; list_reply?: ButtonReply };
};
/** Meta's (unofficial, partner-documented — see waBot.ts's design notes if
 *  this ever needs re-checking against Meta's own schema) "Coexistence"
 *  signal for a message YOUR TEAM sent from the regular WhatsApp app/Web
 *  on this number, not from this dashboard. Only arrives at all once this
 *  field is subscribed in Meta's webhook config — off by default. */
type MessageEcho = { id?: string; to?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } };
type Contact = { wa_id?: string; profile?: { name?: string } };
type Body = { entry?: { changes?: { value?: { statuses?: StatusEvent[]; messages?: IncomingMessage[]; contacts?: Contact[]; message_echoes?: MessageEcho[] } }[] }[] };

/** Meta's message `type` field → a short label for the handover reason +
 *  a placeholder preview string for the conversation thread/history (the
 *  bot never tries to read the actual attachment — see waBot.ts). */
function describeMedia(m: IncomingMessage): { label: string; text: string; mediaId?: string } | null {
  switch (m.type) {
    case "image": return { label: "photo", text: `[Photo]${m.image?.caption ? ` ${m.image.caption}` : ""}`, mediaId: m.image?.id };
    case "document": return { label: "document", text: `[Document${m.document?.filename ? `: ${m.document.filename}` : ""}]${m.document?.caption ? ` ${m.document.caption}` : ""}`, mediaId: m.document?.id };
    case "video": return { label: "video", text: `[Video]${m.video?.caption ? ` ${m.video.caption}` : ""}`, mediaId: m.video?.id };
    case "audio": return { label: "voice message", text: "[Voice message]", mediaId: m.audio?.id };
    case "sticker": return { label: "sticker", text: "[Sticker]", mediaId: m.sticker?.id };
    case "location": return { label: "location", text: `[Location shared]${m.location?.name ? ` ${m.location.name}` : ""}` };
    default: return null; // contacts, unsupported/unknown types — genuinely out of scope today, same as before
  }
}

/** A tap on a quick-reply button/list — either our own interactive message
 *  or an older template button — resolved to its visible label, so it
 *  flows through the exact same text pipeline a typed reply would (FAQ/
 *  keyword matching already treats "Talk to a human" as a handover
 *  trigger, for example — no separate button-id handling needed). */
function describeButtonTap(m: IncomingMessage): string | null {
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
  if (m.type === "button") return m.button?.text ?? null;
  return null;
}

function signatureValid(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured — skip the check rather than refuse every delivery
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(header.slice(7));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 2026-11-19: now that Meta's one webhook subscription points here instead
 *  of bagdrop-web's own /api/whatsapp/webhook, bagdrop-web's delivery-status
 *  lookup (app/api/admin/bookings/[id]/send-whatsapp's GET — "did this
 *  actually deliver") would otherwise go stale, since it reads a table only
 *  THAT webhook used to fill. Forward every raw status-bearing payload over
 *  so bagdrop-web's own route (unchanged, zero code touched there) keeps
 *  populating it exactly as before. Fire-and-forget via after(), same
 *  convention as automation.ts's kickSweep() — this can never fail the
 *  response Meta is waiting on, and a missing/misconfigured PROD_SITE_URL
 *  (or bagdrop-web rejecting it, e.g. its own WHATSAPP_APP_SECRET check) is
 *  silently swallowed, not retried — Meta's own retry-on-non-200 already
 *  covers this URL; retrying a side forward too would just double it. */
function forwardStatusToBagdropWeb(raw: string, header: string | null): void {
  const site = process.env.PROD_SITE_URL;
  if (!site) return;
  after(async () => {
    try {
      await fetch(`${site.replace(/\/$/, "")}/api/whatsapp/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(header ? { "x-hub-signature-256": header } : {}) },
        body: raw,
      });
    } catch { /* best-effort — see comment above */ }
  });
}

export async function POST(req: Request) {
  /* Meta always expects 200 quickly, or it retries the same event for hours —
   * acknowledge first, work is small and best-effort either way. */
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  }
  let body: Body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  forwardStatusToBagdropWeb(raw, req.headers.get("x-hub-signature-256"));
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ ok: true });

  const values = (body.entry ?? []).flatMap((e) => e.changes ?? []).map((c) => c.value ?? {});

  for (const value of values) {
    for (const s of value.statuses ?? []) {
      if (!s.id || !s.status) continue;
      const waStatus = s.status as OutboxDoc["waStatus"];
      // this status might belong to a lifecycle-template send (the outbox,
      // via "wa:<wamid>") OR a conversational bot/admin reply (wa_messages,
      // via "wam:<wamid>") — the two never collide (different key prefix),
      // and a status callback is never for both, so try outbox first, then
      // the conversational mapping, and otherwise it's for something this
      // webhook doesn't track at all (e.g. an OTP).
      const { data: map } = await sb.from("settings").select("doc").eq("id", `wa:${s.id}`).maybeSingle();
      const outboxId = (map?.doc as { outboxId?: string } | null)?.outboxId;
      if (outboxId) {
        const { data: row } = await sb.from("outbox").select("id, doc").eq("id", outboxId).maybeSingle();
        if (row) {
          const doc = row.doc as OutboxDoc;
          const next: OutboxDoc = { ...doc, waStatus, waError: s.errors?.[0] ? `${s.errors[0].title ?? ""} ${s.errors[0].message ?? ""}`.trim() : doc.waError };
          await sb.from("outbox").update({ doc: next }).eq("id", outboxId);
        }
        continue;
      }
      await updateMessageStatusByWamid(sb, s.id, waStatus);
    }

    const contactByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name] as const));
    for (const m of value.messages ?? []) {
      if (!m.id || !m.from) continue;
      const buttonTap = describeButtonTap(m);
      const media = m.type !== "text" && !buttonTap ? describeMedia(m) : null;
      const text = buttonTap ?? (m.type === "text" ? m.text?.body : media?.text);
      if (!text) continue; // an unsupported/unknown type (contacts, system messages, …) or a malformed text payload — genuinely nothing to show
      try {
        await handleInboundMessage(sb, {
          mobile: m.from, waId: m.from, profileName: contactByWaId.get(m.from), text, wamid: m.id, timestamp: m.timestamp,
          mediaType: buttonTap ? undefined : media?.label, mediaId: buttonTap ? undefined : media?.mediaId,
        });
      } catch (e) {
        await logEvent(sb, { type: "error", conversationId: m.from.replace(/\D/g, "").slice(-10), detail: "handleInboundMessage threw — see error field.", error: e instanceof Error ? e.message : String(e), at: new Date().toISOString() }, `waerr:${m.id}`);
      }
    }

    // Coexistence: a message YOUR TEAM sent from the regular WhatsApp app/
    // Web, mirrored here only if that field is subscribed in Meta's
    // webhook config (off by default — see the MessageEcho comment above).
    // Logged for VISIBILITY only: never runs the bot, never creates a
    // lead/handover, matching the explicit guidance that this signal isn't
    // reliable enough to drive automation decisions off of.
    for (const e of value.message_echoes ?? []) {
      if (!e.id || !e.to || e.type !== "text" || !e.text?.body) continue;
      const conversationId = normalizeMobile(e.to);
      if (conversationId.length !== 10) continue;
      // id = e.id itself (not a fresh newToken()) so a retried webhook delivery can't double-log the same echo.
      await addMessage(sb, { conversationId, direction: "out", text: e.text.body, from: "team", waId: e.id, at: e.timestamp ? new Date(Number(e.timestamp) * 1000).toISOString() : new Date().toISOString() }, e.id);
    }
  }
  return NextResponse.json({ ok: true });
}
