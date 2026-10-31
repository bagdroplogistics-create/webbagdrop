/** The automation backbone — outbox, notify(), template pairs, providers,
 *  and the sweep passes. Server-only (service role).
 *
 *  Design (six-sigma control plan):
 *  · Every event is an OUTBOX ROW with a deterministic idempotency key as
 *    its id — a replayed webhook, double sweep or second click can never
 *    double-send or double-process (insert conflicts are ignored).
 *  · notify() always emits a TEMPLATE PAIR: one WhatsApp + one email event
 *    per message. Nothing informs on one channel only.
 *  · Providers degrade gracefully: with no API keys configured, a send
 *    completes as a logged "stub" carrying the ready wa.me/mailto link, so
 *    the team can fire it manually until the keys arrive — the flow shape
 *    never changes, only the last hop.
 *  · A row failing MAX_ATTEMPTS lands in status "dead" (the dead-letter
 *    queue) — never silently dropped. The admin Automation desk shows it. */
import { mutateBooking } from "./bookingStore";
import { serviceClient } from "./supabaseAdmin";
import { MILESTONES, opsOf, type MilestoneKey } from "./opsModel";
import { inspect, DEFAULT_DEPARTMENTS, type DeptContact } from "./inspector";
import { COMPANY } from "./company";
import type { Booking, CrmActivity, Inquiry } from "./types";
import { isPaid } from "./payState";
import { loadAgents } from "./partners";
import { confirmLinkPayment, ensurePaymentLink } from "./paymentLinks";
import { cancelPaymentLink, gatewayLinkOf, razorpayConfigured } from "./razorpay";

const MAX_ATTEMPTS = 5;

export interface OutboxDoc {
  kind: string;                 // send.wa | send.email | note
  key: string;                  // idempotency key == row id
  to?: string;                  // mobile or email
  name?: string;
  template?: string;
  text?: string;                // rendered body
  subject?: string;
  status: "queued" | "done" | "dead";
  stub?: boolean;               // completed without a provider (link logged)
  link?: string;                // wa.me/mailto link when stubbed
  attempts: number;
  lastError?: string;
  createdAt: string;
  doneAt?: string;
}

/* ================= templates — the WhatsApp + email pairs ================= */
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
type T = { wa: (d: Record<string, string>) => string; subject: (d: Record<string, string>) => string };

export const TEMPLATES: Record<string, T> = {
  inquiry_ack: {
    wa: (d) => `Hi ${d.name}, Bagdrop here — we have your request for ${d.lane}. A specialist reaches you within 15 minutes with the rate and pickup plan. Your reference: ${d.ref}.`,
    subject: () => "Bagdrop — we have your request",
  },
  instant_ack: {
    wa: (d) => `Hi ${d.name}, your Bagdrop booking ${d.ref} (${d.lane}) is reserved for you at ${d.amount} (GST 5% included). Pay within ${d.mins} minutes to confirm it instantly — UPI, card or netbanking: ${d.paylink || d.dashboard}${d.paylink ? `\nYour bookings: ${d.dashboard}` : ""}`,
    subject: (d) => `Pay ${d.amount} to confirm ${d.ref} instantly`,
  },
  instant_lapsed: {
    wa: (d) => `Hi ${d.name}, the instant hold on your Bagdrop booking ${d.ref} (${d.lane}) has lapsed unpaid. No problem — our team will confirm your booking shortly and send the payment details. Your bookings: ${d.dashboard}`,
    subject: (d) => `About your booking ${d.ref}`,
  },
  payment_received: {
    wa: (d) => `Hi ${d.name}, payment of ${d.amount} received for ${d.ref} (${d.lane}). Your tax invoice follows. Your bags are on the plan — live tracking on your booking page.`,
    subject: (d) => `Payment received · ${d.ref}`,
  },
  ms_assign: { wa: (d) => `Bagdrop ${d.ref}: your pickup is scheduled — captain assigned for ${d.date}, window ${d.slot}.`, subject: (d) => `Pickup scheduled · ${d.ref}` },
  ms_picked: { wa: (d) => `Bagdrop ${d.ref}: ${d.pieces} bag(s) picked up and sealed with you. Every bag is tagged and scan-tracked from here.`, subject: (d) => `Picked up & sealed · ${d.ref}` },
  ms_inscan: { wa: (d) => `Bagdrop ${d.ref}: your bags are checked in at our ${d.from} hub — all pieces scanned and accounted for.`, subject: (d) => `In hub · ${d.ref}` },
  ms_depart: { wa: (d) => `Bagdrop ${d.ref}: on the move — your bags departed ${d.from} towards ${d.to}.`, subject: (d) => `In transit · ${d.ref}` },
  ms_arrive: { wa: (d) => `Bagdrop ${d.ref}: arrived at ${d.to} — all pieces scanned in. Delivery is next.`, subject: (d) => `Arrived ${d.to} · ${d.ref}` },
  ms_ofd: { wa: (d) => `Bagdrop ${d.ref}: out for delivery in ${d.to}. Bags are released only against your verified identity.`, subject: (d) => `Out for delivery · ${d.ref}` },
  ms_pod: { wa: (d) => `Bagdrop ${d.ref}: delivered. ${d.pieces} bag(s), every tag scanned end to end. Thank you for travelling light — we'd love your feedback.`, subject: (d) => `Delivered · ${d.ref}` },
  quote_ready: {
    wa: (d) => `Hi ${d.name}, your Bagdrop quote for ${d.lane} is ready: ${d.amount}, locked for 24 hours.\nPay securely here: ${d.link}\nRef: ${d.ref}.`,
    subject: (d) => `Your Bagdrop quote · ${d.amount} · ${d.lane}`,
  },
  quote_nudge: {
    wa: (d) => `Hi ${d.name}, just a nudge — your Bagdrop quote of ${d.amount} for ${d.lane} is still locked for you. Pay here when ready: ${d.link}`,
    subject: (d) => `Your quote is waiting · ${d.ref}`,
  },
  quote_expiring: {
    wa: (d) => `Hi ${d.name}, your locked Bagdrop price of ${d.amount} for ${d.lane} expires in a few hours. Secure it now: ${d.link}`,
    subject: (d) => `Price lock expiring · ${d.ref}`,
  },
  follow_up: {
    wa: (d) => `Hi ${d.name}, following up on your Bagdrop request for ${d.lane} — our team is finalising your rate. Anything we should know meanwhile, reply here. Ref: ${d.ref}.`,
    subject: (d) => `About your Bagdrop request · ${d.ref}`,
  },
  otp_code: {
    wa: (d) => `${d.code} is your Bagdrop verification code. Valid 10 minutes — never share it with anyone, including Bagdrop staff.`,
    subject: (d) => `${d.code} is your Bagdrop code`,
  },
  verify_identity: {
    wa: (d) => `Hi ${d.name}, payment verified for ${d.ref} (${d.lane}). One step left before pickup: sign the baggage indemnity bond — tick the prohibited-items declarations and sign with your Aadhaar OTP (international guests upload passport + visa). Your bags move only against a signed bond. Sign here: ${d.link}`,
    subject: (d) => `Action needed before pickup · verify your identity · ${d.ref}`,
  },
  kyc_issue: {
    wa: (d) => `Hi ${d.name}, about your Bagdrop booking ${d.ref}: ${d.note}\nFinish or check your verification here: ${d.link} — or reply on WhatsApp and our team will help.`,
    subject: (d) => `Action needed before pickup · ${d.ref}`,
  },
  kyc_due: {
    wa: (d) => `Hi ${d.name}, your Bagdrop pickup for ${d.ref} (${d.lane}) is on ${d.date}, but the indemnity bond isn't signed yet. Pickup can't happen until it is — it takes two minutes: ${d.link}`,
    subject: (d) => `Sign before pickup · ${d.ref}`,
  },
  identity_done: {
    wa: (d) => `Hi ${d.name}, identity verified for ${d.ref} — you're all set. The captain seals your bags with you at pickup on ${d.date}.`,
    subject: (d) => `Identity verified · ${d.ref}`,
  },
  /* internal — the ops alert channel renders its own text */
  ops_alert: {
    wa: (d) => d.text,
    subject: (d) => d.subject,
  },
  /* ---- booking decisions (admin → client) ---- */
  booking_approved: {
    wa: (d) => d.paylink
      ? `Hi ${d.name}, good news — your Bagdrop booking ${d.ref} (${d.lane}) is APPROVED. Amount payable: ${d.amount} (GST 5% included).\nPay securely here — UPI, card or netbanking, confirmed instantly: ${d.paylink}\nYour bookings: ${d.dashboard}`
      : `Hi ${d.name}, good news — your Bagdrop booking ${d.ref} (${d.lane}) is APPROVED. Amount payable: ${d.amount} (GST 5% included).\nPay by UPI to ${d.upi}${d.bank ? ` or bank transfer to ${d.bank}` : ""}, then upload your payment screenshot in your dashboard: ${d.dashboard}\nPayment page with QR: ${d.link}`,
    subject: (d) => `Approved · pay ${d.amount} to confirm ${d.ref}`,
  },
  booking_rejected: {
    wa: (d) => `Hi ${d.name}, we're sorry — we can't take booking ${d.ref} (${d.lane}). Reason: ${d.note}. Reply here and our team will help with an alternative.`,
    subject: (d) => `About your Bagdrop booking ${d.ref}`,
  },
  booking_on_hold: {
    wa: (d) => `Hi ${d.name}, your Bagdrop booking ${d.ref} (${d.lane}) is on hold for a moment: ${d.note}. We'll update you shortly — no action needed yet.`,
    subject: (d) => `Booking on hold · ${d.ref}`,
  },
  booking_info_needed: {
    wa: (d) => `Hi ${d.name}, to process booking ${d.ref} (${d.lane}) we need a little more from you: ${d.note}\nReply here, or update it in your dashboard: ${d.dashboard}`,
    subject: (d) => `We need a detail for ${d.ref}`,
  },
  quote_revised: {
    wa: (d) => `Hi ${d.name}, your Bagdrop quote for ${d.ref} (${d.lane}) is ready: ${d.amount} (GST 5% included).${d.note ? ` Note: ${d.note}.` : ""} You'll receive payment details once the booking is approved. Dashboard: ${d.dashboard}`,
    subject: (d) => `Your quote · ${d.amount} · ${d.ref}`,
  },
  payment_rejected: {
    wa: (d) => `Hi ${d.name}, we couldn't match your payment for ${d.ref} to our bank receipt${d.note ? ` (${d.note})` : ""}. Please check and re-upload the payment proof in your dashboard: ${d.dashboard}`,
    subject: (d) => `Payment not verified · ${d.ref}`,
  },
  /* ---- B2B: the booking agent hears every step of their client's booking ---- */
  agent_update: {
    wa: (d) => `Hi ${d.name}, Bagdrop partner update · ${d.ref} · ${d.client} (${d.lane}): ${d.update}\nAll your bookings, live: ${d.portal}`,
    subject: (d) => `${d.headline} · ${d.ref} · ${d.client}`,
  },
  topup_verified: {
    wa: (d) => `Hi ${d.name}, the extra payment of ${d.amount} for ${d.ref} is verified. Your updated bag count is confirmed.`,
    subject: (d) => `Extra payment verified · ${d.ref}`,
  },
};

/* ================= internal ops alerts (BAGDROP OS notifications) =================
 * Every major and minor platform event also fans out to ONE configured ops
 * contact — a WhatsApp number and/or email set in the Automation desk and
 * stored in the settings table (id "alerts"). Same outbox, same idempotency,
 * same graceful stubbing as customer messages. */
export interface AlertConfig { mobile?: string; email?: string; inquiryEmails?: string[] }

/** Every new website inquiry is emailed here (configurable in the settings
 *  doc "alerts"; these two are the standing default). */
export const DEFAULT_INQUIRY_EMAILS = ["info@bagdrop.co", "aditya@bagdrop.co"];

let alertCache: { cfg: AlertConfig; at: number } | null = null;
export async function loadAlerts(): Promise<AlertConfig> {
  if (alertCache && Date.now() - alertCache.at < 60_000) return alertCache.cfg;
  const sb = serviceClient();
  if (!sb) return {};
  const { data } = await sb.from("settings").select("doc").eq("id", "alerts").maybeSingle();
  const cfg = (data?.doc as AlertConfig | null) ?? {};
  alertCache = { cfg, at: Date.now() };
  return cfg;
}
export async function saveAlerts(cfg: AlertConfig): Promise<void> {
  const sb = serviceClient()!;
  const { error } = await sb.from("settings").upsert({ id: "alerts", doc: cfg, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
  alertCache = { cfg, at: Date.now() };
}

export async function opsNotify(text: string, subject: string, key: string): Promise<number> {
  const cfg = await loadAlerts();
  if (!cfg.mobile && !cfg.email) return 0;
  return notify("ops_alert", { name: "Bagdrop Ops", mobile: cfg.mobile, email: cfg.email }, { text, subject }, key);
}

/** New-inquiry email to the inquiry desk (info@ + aditya@ by default),
 *  one idempotent email per address. */
export async function notifyInquiryDesk(text: string, subject: string, key: string): Promise<number> {
  const cfg = await loadAlerts();
  const emails = cfg.inquiryEmails?.length ? cfg.inquiryEmails : DEFAULT_INQUIRY_EMAILS;
  let n = 0;
  for (const email of emails) {
    n += await notify("ops_alert", { name: "Bagdrop Inquiry Desk", email }, { text, subject }, `${key}:${email}`);
  }
  return n;
}

/** Atomic "first time only" guard — returns true exactly once per key
 *  (e.g. an OTP proof can create one booking or one login, never two). */
export async function claimOnce(key: string): Promise<boolean> {
  const n = await insertRows([{ kind: "note", key, status: "done", attempts: 0, createdAt: new Date().toISOString() }]);
  return n > 0;
}

/** Department contact registry (settings id "departments") — defaults merged
 *  in, saved contacts win. Shared with the Inspector API. */
export async function loadDepartments(): Promise<DeptContact[]> {
  const sb = serviceClient();
  if (!sb) return DEFAULT_DEPARTMENTS;
  const { data } = await sb.from("settings").select("doc").eq("id", "departments").maybeSingle();
  const saved = (data?.doc as { departments?: DeptContact[] } | null)?.departments ?? [];
  return DEFAULT_DEPARTMENTS.map((d) => saved.find((s) => s.key === d.key) ?? d);
}

export const MILESTONE_TEMPLATE: Partial<Record<MilestoneKey, string>> = {
  assign: "ms_assign", picked: "ms_picked", inscan: "ms_inscan",
  depart: "ms_depart", arrive: "ms_arrive", ofd: "ms_ofd", pod: "ms_pod",
};

/* ================= outbox primitives ================= */
async function insertRows(rows: OutboxDoc[]): Promise<number> {
  const sb = serviceClient();
  if (!sb || rows.length === 0) return 0;
  // Idempotency: id == key; duplicate keys are ignored, not errors.
  const { error, count } = await sb.from("outbox")
    .upsert(rows.map((d) => ({ id: d.key, doc: d, status: d.status, created: d.createdAt })), { onConflict: "id", ignoreDuplicates: true, count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Emit the WhatsApp + email pair for one template. Returns rows created
 *  (0 when the key was already processed — the idempotent no-op). */
/** Links in messages must be tappable on a phone: a relative path such as
 *  /verify/BD-… becomes https://www.bagdrop.co/verify/BD-… (SITE_URL
 *  overrides the base, e.g. for a staging deployment). */
const SITE = (process.env.SITE_URL || `https://${COMPANY.web}`).replace(/\/$/, "");
const LINK_FIELDS = new Set(["link", "dashboard", "portal", "paylink"]);
const absolute = (data: Record<string, string>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, LINK_FIELDS.has(k) && typeof v === "string" && v.startsWith("/") ? SITE + v : v]));

export async function notify(template: string, to: { name: string; mobile?: string; email?: string }, raw: Record<string, string>, key: string): Promise<number> {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`NO_TEMPLATE:${template}`);
  const data = absolute(raw);
  const text = t.wa({ name: to.name.split(" ")[0] || to.name, ...data });
  const now = new Date().toISOString();
  const rows: OutboxDoc[] = [];
  if (to.mobile) rows.push({ kind: "send.wa", key: `${key}:wa`, to: to.mobile, name: to.name, template, text, status: "queued", attempts: 0, createdAt: now });
  if (to.email) rows.push({ kind: "send.email", key: `${key}:em`, to: to.email, name: to.name, template, text, subject: t.subject(data), status: "queued", attempts: 0, createdAt: now });
  return insertRows(rows);
}

/* ================= providers (graceful stub without keys) ================= */
export async function sendWhatsApp(mobile: string, text: string): Promise<{ stub: boolean; link?: string }> {
  const token = process.env.META_WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_ID;
  const msisdn = mobile.replace(/\D/g, "").replace(/^(?!91)/, "91");
  if (!token || !phoneId) return { stub: true, link: `https://wa.me/${msisdn}?text=${encodeURIComponent(text)}` };
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: msisdn, type: "text", text: { body: text } }),
  });
  if (!r.ok) throw new Error(`WA_${r.status}:${(await r.text()).slice(0, 200)}`);
  return { stub: false };
}

export async function sendEmail(email: string, subject: string, text: string): Promise<{ stub: boolean; link?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { stub: true, link: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Bagdrop <updates@bagdrop.co>", to: [email], subject, text }),
  });
  if (!r.ok) throw new Error(`EMAIL_${r.status}:${(await r.text()).slice(0, 200)}`);
  return { stub: false };
}

/* ================= the sweep ================= */
/** Sweep passes read many bookings up front and write seconds later. Every
 *  write goes through here: the change is applied to a FRESH copy read just
 *  before saving, so a staff, finance or client update made meanwhile is
 *  never overwritten by a stale one. `change` returns null to skip. */
async function writeFresh(id: string, change: (fresh: Booking) => Booking | null): Promise<Booking | null> {
  return mutateBooking(serviceClient()!, id, change);
}

export interface SweepStats {
  leadsCreated: number; acksQueued: number; milestoneQueued: number; paidQueued: number;
  cadenceQueued: number; requoted: number; opsQueued: number; ctoFlagged: number; lrDrafts: number; invoices: number;
  sent: number; stubbed: number; failed: number; dead: number; agentQueued: number;
}

/** Pass A — lead auto-capture: every booking and inquiry that has no CRM
 *  record yet becomes one, with the customer's instant acknowledgement. */
async function capturePass(stats: SweepStats) {
  const sb = serviceClient()!;
  const [bk, inq, crm] = await Promise.all([
    sb.from("bookings").select("doc").order("created", { ascending: false }).limit(200),
    sb.from("inquiries").select("doc").order("created", { ascending: false }).limit(100),
    sb.from("crm").select("doc"),
  ]);
  const activity = (crm.data ?? []).map((r) => r.doc as CrmActivity);
  const seen = new Set(activity.map((a) => a.followKey).filter(Boolean));
  const newRows: { id: string; doc: CrmActivity; status: null; created: string }[] = [];
  const now = new Date().toISOString();

  for (const r of bk.data ?? []) {
    const b = r.doc as Booking;
    const fk = `autolead:${b.id}`;
    if (seen.has(fk)) continue;
    const paid = isPaid(b);
    const doc: CrmActivity = {
      id: `CRM-A-${b.id.slice(-8)}`, created: now, kind: paid ? "customer" : "lead",
      text: paid ? `Customer · ${b.traveller.name} (${b.from} → ${b.to}, ${inr(b.pay!.amount)})` : `Lead · ${b.traveller.name} (${b.from} → ${b.to})`,
      ...(paid ? {} : { stage: "new" as const, value: b.quote.total || 0 }),
      mobile: b.traveller.mobile, contact: b.traveller.mobile, refId: b.id, followKey: fk, source: b.source ?? "website",
    };
    newRows.push({ id: doc.id, doc, status: null, created: now });
    stats.leadsCreated++;
    const inst = (b.admin as { instant?: { holdMinutes?: number; holdUntil?: string | null; expired?: boolean } }).instant;
    let link = gatewayLinkOf(b);
    /* the booking route couldn't make the link (Razorpay briefly unavailable)? try again now */
    if (inst && !inst.expired && !paid && !link && razorpayConfigured()) {
      const l = await ensurePaymentLink(sb, b.id, SITE).catch(() => null);
      if (l && !("error" in l)) link = l;
    }
    stats.acksQueued += inst && !inst.expired && !paid
      ? await notify("instant_ack", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email },
          { lane: `${b.from} → ${b.to}`, ref: b.id, amount: inr(b.quote.total), mins: String(inst.holdMinutes ?? 30), paylink: link?.url ?? "", dashboard: "/account" }, `ack:${b.id}`)
      : await notify("inquiry_ack", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email },
          { lane: `${b.from} → ${b.to}`, ref: b.id }, `ack:${b.id}`);
    stats.opsQueued += await opsNotify(
      `${inst ? "⚡ INSTANT " : "🧳 New "}${paid ? "booking" : inst ? "booking — auto-approved, awaiting payment" : "booking request"} ${b.id} · ${b.traveller.name} · ${b.from} → ${b.to} · ${b.bags + b.oversize} pcs · ${b.date || "date TBC"} · via ${b.source ?? "website"}${paid ? ` · PAID ${inr(b.pay!.amount)}` : " · rate to confirm"}`,
      `New ${paid ? "booking" : "request"} · ${b.id} · ${b.from} → ${b.to}`,
      `ops:new:${b.id}`);
  }
  for (const r of inq.data ?? []) {
    const i = r.doc as Inquiry;
    const fk = `autolead:inq:${i.id}`;
    if (seen.has(fk)) continue;
    const doc: CrmActivity = {
      id: `CRM-A-INQ-${i.id.slice(-8)}`, created: now, kind: "lead", stage: "new",
      text: `Lead · ${i.contact.name} (${i.venue ?? i.venueCity ?? "inquiry"})`,
      value: (i.bags || 40) * 3000, mobile: i.contact.mobile, contact: i.contact.mobile,
      refId: i.id, followKey: fk, source: "inquiry",
    };
    newRows.push({ id: doc.id, doc, status: null, created: now });
    stats.leadsCreated++;
    stats.acksQueued += await notify("inquiry_ack",
      { name: i.contact.name, mobile: i.contact.mobile, email: i.contact.email },
      { lane: i.venueCity ?? "your event", ref: i.id }, `ack:${i.id}`);
    stats.opsQueued += await opsNotify(
      `📥 New inquiry ${i.id} · ${i.contact.name} (${i.contact.role ?? "event"}) · ${i.bags ?? "?"} bags · ${i.families ?? "?"} families · ${i.venue ?? i.venueCity ?? ""} — needs a rate.`,
      `New inquiry · ${i.id}`,
      `ops:inq:${i.id}`);
  }
  if (newRows.length) {
    const { error } = await sb.from("crm").upsert(newRows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

/** Pass B — milestone + payment auto-updates: any completed milestone or
 *  captured payment that hasn't produced its message pair yet, does now. */
async function eventPass(stats: SweepStats) {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc").order("created", { ascending: false }).limit(200);
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    const to = { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email };
    const d = { ref: b.id, lane: `${b.from} → ${b.to}`, from: b.from, to: b.to, date: b.date, slot: b.slot || "as planned", pieces: String(b.bags + b.oversize), amount: inr(b.pay?.amount ?? 0) };
    if (isPaid(b)) {
      stats.paidQueued += await notify("payment_received", to, d, `paid:${b.id}`);
      stats.opsQueued += await opsNotify(
        `💰 Payment verified · ${b.id} · ${b.traveller.name} · ${inr(b.pay!.amount)} via ${b.pay!.gateway} · ${b.from} → ${b.to}${b.identity?.ok ? "" : " · Aadhaar pending (pickup locked)"}`,
        `Payment verified · ${inr(b.pay!.amount)} · ${b.id}`,
        `ops:paid:${b.id}`);
    }
    /* paid but not yet Aadhaar-verified → one verification ask (pickup is
     * blocked server-side until identity.ok, so this closes the loop) */
    if ((isPaid(b) || (b.payer && b.status === "accepted")) && !b.identity?.ok && !["delivered", "cancelled", "rejected"].includes(b.status)) {
      stats.paidQueued += await notify("verify_identity", to, { ...d, link: `/verify/${b.id}` }, `idv:${b.id}`);
    }
    if (b.identity?.ok && isPaid(b)) {
      stats.paidQueued += await notify("identity_done", to, d, `idok:${b.id}`);
      stats.opsQueued += await opsNotify(
        `🪪 Identity verified · ${b.id} · ${b.traveller.name} · pickup released (${b.slot || "slot TBC"} on ${b.date || "date TBC"})`,
        `Identity verified · ${b.id}`,
        `ops:idok:${b.id}`);
    }
    const ms = opsOf(b).milestones ?? {};
    for (const m of MILESTONES) {
      const tpl = MILESTONE_TEMPLATE[m.key];
      if (tpl && ms[m.key]) {
        stats.milestoneQueued += await notify(tpl, to, d, `ms:${b.id}:${m.key}`);
        stats.opsQueued += await opsNotify(
          `🚚 ${b.id} · ${m.name} · ${b.from} → ${b.to} · ${b.traveller.name}`,
          `${m.name} · ${b.id}`,
          `ops:ms:${b.id}:${m.key}`);
      }
    }
  }
}

/** Pass B1 — B2B agent updates: for every booking an agent made, the agent
 *  gets one WhatsApp + email per step (received, confirmed, bond pending /
 *  signed, each milestone, cancelled) so they can keep their client posted
 *  without logging in. Idempotent keys (ag:<booking>:<step>), like the
 *  client's own messages. */
const AGENT_MS: Partial<Record<MilestoneKey, [string, (b: Booking) => string]>> = {
  assign: ["Captain assigned", (b) => `captain assigned — pickup on ${b.date || "the planned date"}, ${b.slot || "window as planned"}.`],
  picked: ["Picked up", (b) => `${b.bags + b.oversize} bag(s) picked up and sealed with your client.`],
  inscan: ["At hub", (b) => `bags checked in at our ${b.from} hub, every piece scanned.`],
  depart: ["In transit", (b) => `bags departed ${b.from} for ${b.to}.`],
  arrive: ["Arrived", (b) => `bags arrived at ${b.to}; delivery is next.`],
  ofd: ["Out for delivery", (b) => `out for delivery in ${b.to}.`],
  pod: ["Delivered", (b) => `delivered — ${b.bags + b.oversize} bag(s), every tag scanned end to end.`],
};
async function agentPass(stats: SweepStats) {
  const sb = serviceClient()!;
  const [{ data }, agents] = await Promise.all([
    sb.from("bookings").select("doc").order("created", { ascending: false }).limit(200),
    loadAgents(),
  ]);
  if (!agents.length) return;
  const byId = new Map(agents.map((a) => [a.id, a]));
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    const agent = byId.get((b.admin as { agentId?: string }).agentId ?? "");
    if (!agent || (!agent.mobile && !agent.email)) continue;
    const to = { name: agent.name || agent.company, mobile: agent.mobile, email: agent.email };
    const base = { ref: b.id, client: b.traveller.name, lane: `${b.from} → ${b.to}`, portal: "/partner" };
    const send = async (step: string, headline: string, update: string) => {
      stats.agentQueued += await notify("agent_update", to, { ...base, headline, update }, `ag:${b.id}:${step}`);
    };
    const closed = ["cancelled", "rejected"].includes(b.status);
    await send("received", "Booking received", `booking received for ${b.bags + b.oversize} bag(s) on ${b.date || "date TBC"}. Bagdrop confirms it shortly.`);
    if (closed) { await send("closed", "Booking cancelled", `this booking was ${b.status}. Contact your Bagdrop account manager for details.`); continue; }
    if (["accepted", "assigned", "picked_up", "in_transit", "delivered"].includes(b.status)) await send("confirmed", "Booking confirmed", "confirmed by Bagdrop.");
    if (!b.identity?.ok && b.status !== "delivered") await send("bond", "Client to sign bond", `your client must sign the baggage declaration & bond before pickup — share this link with them: ${SITE}/verify/${b.id}`);
    if (b.identity?.ok) await send("bondok", "Bond signed", "your client has signed the bond — pickup is released.");
    const ms = opsOf(b).milestones ?? {};
    for (const m of MILESTONES) {
      const step = AGENT_MS[m.key];
      if (step && ms[m.key]) await send(`ms:${m.key}`, step[0], step[1](b));
    }
  }
}

/** After an online payment lands (checkout, payment link or webhook): tell
 *  ops, confirm a top-up to the customer, and kick the sweep so the receipt,
 *  5% GST invoice and bond request go out. A duplicate is flagged for refund. */
export async function announcePayment(b: Booking, p: { kind: "full" | "topup"; amount: number; paymentId: string; method?: string; duplicate: boolean; via: string }) {
  const to = { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email };
  if (p.duplicate) {
    await opsNotify(`⚠ DUPLICATE ONLINE PAYMENT · ${b.id} · ${b.traveller.name} · ${inr(p.amount)} · Razorpay ${p.paymentId} — the booking was already paid. Refund this payment in the Razorpay dashboard.`, `Duplicate payment to refund · ${b.id}`, `rzpdup:${p.paymentId}`);
    return;
  }
  if (p.kind === "topup") await notify("topup_verified", to, { ref: b.id, amount: inr(p.amount) }, `topupok:${b.id}:${p.paymentId}`);
  await opsNotify(`💳 PAID ONLINE · ${b.id} · ${b.traveller.name} · ${inr(p.amount)}${p.kind === "topup" ? " (extra bags)" : ""} · Razorpay ${p.paymentId}${p.method ? ` · ${p.method}` : ""} · via ${p.via} — auto-verified, no finance action needed.`, `Paid online · ${inr(p.amount)} · ${b.id}`, `rzp:${p.paymentId}`);
  kickSweep();
}

/** Pass B1b — payment-link safety net: an open link that Razorpay reports
 *  paid (customer closed the tab before the redirect, webhook not set up)
 *  is confirmed here from Razorpay's own records. */
async function paymentLinkPass(stats: SweepStats) {
  if (!razorpayConfigured()) return;
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc").order("created", { ascending: false }).limit(200);
  const open = (data ?? []).map((r) => r.doc as Booking).filter((b) => gatewayLinkOf(b)).slice(0, 30);
  for (const b of open) {
    const r = await confirmLinkPayment(sb, b.id, gatewayLinkOf(b)!.id, "payment link").catch(() => null);
    if (r?.status === "applied") {
      stats.paidQueued++;
      await announcePayment(r.booking, { kind: r.kind, amount: r.amount, paymentId: r.paymentId, method: r.method, duplicate: r.duplicate, via: "payment link (sweep)" });
    }
  }
}

/** Pass B1c — instant holds: an instant booking not paid within its hold
 *  goes back to the team for a normal approval (its link is cancelled), so
 *  an unpaid booking never keeps an instant place. */
async function instantHoldPass(stats: SweepStats) {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc").order("created", { ascending: false }).limit(300);
  const nowMs = Date.now();
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    const i = (b.admin as { instant?: { holdUntil?: string | null; expired?: boolean } }).instant;
    if (!i?.holdUntil || i.expired || isPaid(b) || b.pay?.status === "submitted" || b.payer || Date.parse(i.holdUntil) > nowMs) continue;
    if (["cancelled", "rejected", "delivered"].includes(b.status)) continue;
    const now = new Date().toISOString();
    const saved = await mutateBooking(sb, b.id, (fresh) => {
      const fi = (fresh.admin as { instant?: { holdUntil?: string | null; expired?: boolean } }).instant;
      if (!fi || fi.expired || isPaid(fresh) || fresh.pay?.status === "submitted") return null;
      const admin = { ...(fresh.admin as Record<string, unknown>) };
      delete admin.rzpLink; /* cancelled at Razorpay below — must not be offered again */
      return {
        ...fresh, status: "submitted",
        admin: { ...admin, instant: { ...fi, expired: true, expiredAt: now }, decision: { state: "pending", at: now, note: "Instant hold lapsed unpaid — needs team approval" } },
        events: [...fresh.events, { at: now, by: "admin", text: "⏱ Instant hold lapsed unpaid — moved to team approval" }],
      };
    });
    if (!saved) continue;
    const link = gatewayLinkOf(b);
    if (link) await cancelPaymentLink(link.id);
    stats.opsQueued += await opsNotify(`⏱ Instant hold lapsed · ${b.id} · ${b.traveller.name} · ${b.from} → ${b.to} — not paid in time, now waiting for a decision in Shipments.`, `Instant hold lapsed · ${b.id}`, `ops:lapse:${b.id}`);
    await notify("instant_lapsed", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email }, { ref: b.id, lane: `${b.from} → ${b.to}`, dashboard: "/account" }, `lapse:${b.id}`);
  }
}

/** Pass B2 — the cadence engine: unpaid quotes get a nudge at 1 h, an
 *  expiry warning at the 20th hour, and ONE automatic fresh quote after
 *  expiry; rate-pending requests get follow-ups at day 1 and day 3. All
 *  idempotent — each touch has exactly one outbox key, ever. */
async function cadencePass(stats: SweepStats) {
  const sb = serviceClient()!;
  const { requoteBooking } = await import("./quoteFactory");
  const { data } = await sb.from("bookings").select("doc").eq("status", "quoted").limit(300);
  const now = Date.now();
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    /* skip only once money is verified OR the customer already sent proof */
    if (isPaid(b) || b.pay?.status === "submitted") continue;
    const to = { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email };
    const ageH = (now - new Date(b.created).getTime()) / 3600_000;
    const d = { ref: b.id, lane: `${b.from} → ${b.to}`, amount: inr(b.quote.total), link: `/q/${b.id}` };

    if (b.quote.breakdown.ror) {
      if (ageH >= 24) stats.cadenceQueued += await notify("follow_up", to, d, `fu1:${b.id}`);
      if (ageH >= 72) stats.cadenceQueued += await notify("follow_up", to, d, `fu3:${b.id}`);
      continue;
    }
    const validMs = b.quote.validUntil ? new Date(b.quote.validUntil).getTime() : 0;
    if (validMs > now) {
      if (ageH >= 1) stats.cadenceQueued += await notify("quote_nudge", to, d, `n1:${b.id}`);
      if (validMs - now <= 4 * 3600_000) stats.cadenceQueued += await notify("quote_expiring", to, d, `n20:${b.id}`);
    } else if (validMs > 0 && ageH < 24 * 14) {
      // expired, unpaid, not ancient → one automatic fresh quote
      const probe = await insertRows([{ kind: "note", key: `rq:${b.id}`, status: "done", attempts: 0, createdAt: new Date().toISOString() }]);
      if (probe > 0) {
        const rq = await requoteBooking(b);
        const added = rq ? rq.doc.events.slice(b.events.length) : [];
        const saved = rq && await writeFresh(b.id, (f) =>
          isPaid(f) || f.pay?.status === "submitted" || f.quote.qid !== b.quote.qid ? null
            : { ...f, quote: rq.doc.quote, status: rq.doc.status, events: [...f.events, ...added] });
        if (rq && saved) {
          stats.requoted++;
          stats.cadenceQueued += await notify("quote_ready", to, { ...d, amount: inr(rq.doc.quote.total), link: `/q/${rq.doc.id}` }, `rqs:${b.id}`);
        }
      }
    }
  }
}

/** Pass B3 — the CHIEF TRACKING OFFICER: the Inspector's 9 SOPs run inside
 *  every sweep (cron + after every server write), 24×7, no dashboard needed.
 *  Every RED flag (SLA breached) is auto-dispatched once — WhatsApp + email
 *  to the responsible department AND the ops alert contact — and stamped on
 *  the booking's event log so the Inspector shows it as flagged and nobody
 *  double-chases. Amber (at-risk) flags stay on the dashboard for humans. */
async function ctoPass(stats: SweepStats) {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc").order("created", { ascending: false }).limit(400);
  const bookings = (data ?? []).map((r) => r.doc as Booking);
  const flags = inspect(bookings).filter((f) => f.severity === "red");
  if (!flags.length) return;
  const depts = await loadDepartments();

  for (const f of flags) {
    const b = bookings.find((x) => x.id === f.bookingId)!;
    /* already flagged (by CTO or a human)? the event log is the ledger */
    if (b.events.some((e) => e.text.startsWith(`⚑ Flagged ${f.rule}`))) continue;

    const dept = depts.find((d) => d.key === f.dept);
    const text = `⚑ CTO auto-flag · ${f.bookingId} · ${f.title} (${f.ageH.toFixed(0)}h off plan)\n${f.detail}\nSOP: ${f.sop}\nLane: ${f.lane} · ${f.date} ${f.slot} · client ${f.client.name} ${f.client.mobile}${f.captain ? ` · captain ${f.captain}` : ""}${f.vendorMobile ? ` · vendor ${f.vendorMobile}` : ""}\nAct now and update the Tracking Inspector.`;
    const subject = `⚑ CTO auto-flag · ${f.title} · ${f.bookingId}`;

    let queued = 0;
    if (dept?.mobile || dept?.email) {
      queued += await notify("ops_alert", { name: dept!.name, mobile: dept!.mobile, email: dept!.email }, { text, subject }, `cto:${f.bookingId}:${f.rule}:dept`);
    }
    queued += await opsNotify(text, subject, `cto:${f.bookingId}:${f.rule}:ops`);
    stats.ctoFlagged++;
    stats.opsQueued += queued;

    const flag = {
      at: new Date().toISOString(), by: "admin" as const,
      text: `⚑ Flagged ${f.rule} → ${dept?.name ?? "ops contact"} · auto · Chief Tracking Officer · ${f.title} (${f.ageH.toFixed(0)}h off plan)`,
    };
    const next = await writeFresh(b.id, (fr) => ({ ...fr, events: [...fr.events, flag] }));
    if (next) b.events = next.events; // keep the in-memory copy consistent for this pass
  }
}

/** Pass B4 — AUTO LR DRAFTS: on the dispatch/pickup day (any sweep after
 *  00:01), every confirmed booking that still has no LR gets its LR
 *  auto-prepared — all fields pre-filled from the booking — and parked as a
 *  DRAFT awaiting the team's one-click approval on the LR page. The team is
 *  alerted; nothing is issued without approval. */
async function lrDraftPass(stats: SweepStats) {
  const sb = serviceClient()!;
  const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const { data } = await sb.from("bookings").select("doc").in("status", ["accepted", "assigned"]).limit(300);
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    if (b.lr) continue;                                          // LR already made manually
    if (!isPaid(b) && !b.payer) continue;                        // approved but payment not verified yet
    if ((b.admin as { lrDraft?: unknown }).lrDraft) continue;    // draft already prepared
    if (!b.date || b.date > today) continue;                     // dispatch day not reached
    const pieces = b.bags + b.oversize;
    const tags = ((b.admin as { ops?: { tags?: string[] } }).ops?.tags ?? []).join(", ");
    const details = {
      consignor: COMPANY.name, consignorMobile: COMPANY.phone, consignorGstin: COMPANY.gstin,
      consignee: b.traveller.name, consigneeMobile: b.traveller.mobile,
      billedTo: b.traveller.name,
      fromAddr: b.pickAddr || b.from, toAddr: b.dropAddr || b.to,
      mode: b.mode, pieces, content: "HOUSEHOLD BAGGAGE", weightKg: pieces * 25,
      tiTag: tags || undefined,
      declaredValue: b.quote.total || undefined,
      invoiceRef: b.quote.qid ?? undefined,
      charges: { freight: Math.round((b.quote.total || 0) / 1.05) },
      insured: "No" as const,
      gstPayableBy: "Consignor",
      paymentTerms: b.pay?.status === "captured" ? "Paid" : "To Pay",
      lrType: "At Branch", deliveryAt: "Door Dly",
      note: b.note || undefined,
    };
    const now = new Date().toISOString();
    const next = await writeFresh(b.id, (f) => f.lr || (f.admin as { lrDraft?: unknown }).lrDraft || !(isPaid(f) || f.payer) ? null : {
      ...f,
      admin: { ...f.admin, lrDraft: { at: now, auto: true, details } },
      events: [...f.events, { at: now, by: "admin", text: "LR draft auto-prepared (dispatch day, after 00:01) · awaiting team approval on the LR page" }],
    });
    if (next) stats.lrDrafts++;
    stats.opsQueued += await opsNotify(
      `📋 LR ready for approval · ${b.id} · ${b.traveller.name} · ${b.from} → ${b.to} · ${pieces} pcs · dispatch ${b.date} — auto-drafted, approve it on the LR page.`,
      `LR awaiting approval · ${b.id}`,
      `lrdraft:${b.id}`);
  }
}

/** Pass B5 — AUTO INVOICE: the moment a payment is captured, the tax
 *  invoice exists. Any paid booking without an INV document gets one with a
 *  race-safe number (next_doc_no), stamped on the event log — the customer
 *  message pair already promises "your tax invoice follows". Also sweeps
 *  credit notes past their expiry date to status "expired". */
async function invoicePass(stats: SweepStats) {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc").order("created", { ascending: false }).limit(300);
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    if (b.pay?.status !== "captured" || !b.pay.amount) continue;
    if ((b.docs ?? []).some((d) => d.type === "INV")) continue;
    const { data: no, error } = await sb.rpc("next_doc_no", { p_type: "INV", p_fy: (await import("./docs")).financialYear() });
    if (error) continue; // next sweep retries
    const now = new Date().toISOString();
    const next = await writeFresh(b.id, (f) => !isPaid(f) || (f.docs ?? []).some((d) => d.type === "INV") ? null : {
      ...f,
      docs: [...(f.docs ?? []), { type: "INV", no: String(no), at: now, amount: f.pay!.amount }],
      events: [...f.events, { at: now, by: "admin", text: `Tax invoice ${no} auto-issued on payment · ${inr(f.pay!.amount)} (GST 5% GTA, SAC 9965)` }],
    });
    if (next) stats.invoices++;
  }
  /* credit notes: active → expired once past their expiry date */
  const { data: cnRow } = await sb.from("settings").select("doc").eq("id", "creditnotes").maybeSingle();
  const notes = ((cnRow?.doc as { notes?: { id: string; status: string; expiresAt?: string }[] })?.notes ?? []);
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  for (const n of notes) {
    if (n.status === "active" && n.expiresAt && n.expiresAt < today) { n.status = "expired"; changed = true; }
  }
  if (changed) await sb.from("settings").upsert({ id: "creditnotes", doc: { notes }, status: null, created: new Date().toISOString() });
}

/** Pass C — drain: deliver queued sends through the providers. */
async function drainPass(stats: SweepStats, limit = 40) {
  const sb = serviceClient()!;
  const { data } = await sb.from("outbox").select("id, doc").eq("status", "queued").order("created").limit(limit);
  for (const row of data ?? []) {
    const doc = row.doc as OutboxDoc;
    try {
      const res = doc.kind === "send.wa"
        ? await sendWhatsApp(doc.to!, doc.text!)
        : doc.kind === "send.email"
          ? await sendEmail(doc.to!, doc.subject ?? "Bagdrop update", doc.text!)
          : { stub: true as const };
      const done: OutboxDoc = { ...doc, status: "done", stub: res.stub, link: res.link, doneAt: new Date().toISOString() };
      await sb.from("outbox").upsert({ id: row.id, doc: done, status: "done", created: doc.createdAt });
      if (res.stub) stats.stubbed++; else stats.sent++;
    } catch (e) {
      const attempts = (doc.attempts ?? 0) + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const upd: OutboxDoc = { ...doc, attempts, lastError: e instanceof Error ? e.message : String(e), status: dead ? "dead" : "queued" };
      await sb.from("outbox").upsert({ id: row.id, doc: upd, status: upd.status, created: doc.createdAt });
      if (dead) stats.dead++; else stats.failed++;
    }
  }
}

/** Pass B6 — COMPLIANCE: a paid booking whose bond is still unsigned on the
 *  day before (or the day of) pickup is an issue — the client gets a
 *  reminder and the BAGDROP OS compliance desk an alert, once per day. */
async function compliancePass(stats: SweepStats) {
  const sb = serviceClient()!;
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const today = ist(new Date()), tomorrow = ist(new Date(Date.now() + 86400000));
  const { data } = await sb.from("bookings").select("doc").in("status", ["accepted", "assigned", "submitted", "revised"]).limit(300);
  for (const r of data ?? []) {
    const b = r.doc as Booking;
    if (!(isPaid(b) || b.payer) || b.identity?.ok || !b.date || b.date > tomorrow || b.date < today) continue;
    const to = { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email };
    const d = { ref: b.id, lane: `${b.from} → ${b.to}`, date: b.date, link: `/verify/${b.id}` };
    stats.paidQueued += await notify("kyc_due", to, d, `kycdue:${b.id}:${today}`);
    const why = (b.admin as { aadhaarLocked?: boolean }).aadhaarLocked ? "Aadhaar locked" : b.kyc?.status === "docs_submitted" ? "documents waiting for OUR review" : b.kyc?.status === "docs_rejected" ? "documents rejected, client to re-upload" : "bond not signed";
    stats.opsQueued += await opsNotify(`🛂 PICKUP AT RISK · ${b.id} · ${b.traveller.name} · pickup ${b.date === today ? "TODAY" : "tomorrow"} · ${why} — Identity & compliance.`,
      `Pickup at risk · ${b.id}`, `ops:kycdue:${b.id}:${today}`);
  }
}

/** The full sweep — idempotent, safe to run as often as you like. */
export async function runSweep(): Promise<SweepStats> {
  const stats: SweepStats = { leadsCreated: 0, acksQueued: 0, milestoneQueued: 0, paidQueued: 0, cadenceQueued: 0, requoted: 0, opsQueued: 0, ctoFlagged: 0, lrDrafts: 0, invoices: 0, sent: 0, stubbed: 0, failed: 0, dead: 0, agentQueued: 0 };
  if (!serviceClient()) throw new Error("SUPABASE_NOT_CONFIGURED");
  await capturePass(stats);
  await eventPass(stats);
  await agentPass(stats);
  await paymentLinkPass(stats);
  await instantHoldPass(stats);
  await cadencePass(stats);
  await ctoPass(stats);
  await lrDraftPass(stats);
  await compliancePass(stats);
  await invoicePass(stats);
  await drainPass(stats);
  return stats;
}

/** Fire-and-forget kick so automation feels instant after admin actions;
 *  the cron sweep remains the guarantee. */
export function kickSweep() {
  runSweep().catch(() => { /* the scheduled sweep retries everything */ });
}
