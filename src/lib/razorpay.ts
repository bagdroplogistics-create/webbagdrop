/** Razorpay Standard Checkout — server-only. Keys come from the environment
 *  (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET); the secret never leaves the
 *  server, and the browser only ever receives the public key id with an
 *  order. A payment counts only after BOTH the checkout signature verifies
 *  AND Razorpay's own API confirms the payment captured for that order and
 *  amount — the browser alone can never mark a booking paid. */
import crypto from "crypto";
import type { Booking } from "./types";

export const razorpayConfigured = () => !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

/** Thrown for a Razorpay API failure; `auth` marks wrong / revoked keys. */
export class RazorpayError extends Error {
  constructor(public status: number, message: string, public auth = status === 401) { super(message); }
}

const authHeader = () => "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");

export async function createOrder(amountInr: number, receipt: string, notes: Record<string, string> = {}): Promise<{ orderId: string; keyId: string; amount: number; currency: string }> {
  const r = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: "INR", receipt: receipt.slice(0, 40), payment_capture: 1, notes }),
  });
  if (!r.ok) throw new RazorpayError(r.status, `RAZORPAY_${r.status}:${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { id: string; amount: number; currency: string };
  return { orderId: j.id, keyId: process.env.RAZORPAY_KEY_ID!, amount: j.amount, currency: j.currency };
}

/** Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key secret),
 *  timing-safe compare. */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expect = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expect), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Razorpay's own record of a payment — the second, independent check. */
export async function fetchPayment(paymentId: string): Promise<{ id: string; status: string; amount: number; order_id: string; method?: string }> {
  const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: authHeader() } });
  if (!r.ok) throw new RazorpayError(r.status, `RAZORPAY_${r.status}:${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Webhook signature check — HMAC-SHA256 of the raw body with the webhook
 *  secret, timing-safe compare. An unverified payload never touches state. */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expect = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expect), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The order a booking is currently paying, kept on the booking so a payment
 *  can only ever settle the booking (and amount) it was created for. */
export interface GatewayOrder { id: string; amount: number; kind: "full" | "topup"; at: string }
export const gatewayOrderOf = (b: Booking): GatewayOrder | undefined => (b.admin as { rzpOrder?: GatewayOrder }).rzpOrder;

/* ---------------- Payment Links ---------------- */

/** The payment link currently open for a booking (one at a time). */
export interface GatewayLink { id: string; url: string; amount: number; kind: "full" | "topup"; at: string; expireBy: number }
export const gatewayLinkOf = (b: Booking): GatewayLink | undefined => (b.admin as { rzpLink?: GatewayLink }).rzpLink;

export async function createPaymentLink(o: {
  amountInr: number; referenceId: string; description: string; callbackUrl: string; expireBy: number;
  customer: { name: string; contact?: string; email?: string }; notes: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const r = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(o.amountInr * 100), currency: "INR", accept_partial: false,
      reference_id: o.referenceId.slice(0, 40), description: o.description.slice(0, 2048), expire_by: o.expireBy,
      customer: { name: o.customer.name, ...(o.customer.contact ? { contact: o.customer.contact } : {}), ...(o.customer.email ? { email: o.customer.email } : {}) },
      /* Bagdrop sends its own WhatsApp + email (with the link); Razorpay stays quiet */
      notify: { sms: false, email: false }, reminder_enable: false,
      notes: o.notes, callback_url: o.callbackUrl, callback_method: "get",
    }),
  });
  if (!r.ok) throw new RazorpayError(r.status, `RAZORPAY_${r.status}:${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { id: string; short_url: string };
  return { id: j.id, url: j.short_url };
}

export async function fetchPaymentLink(id: string): Promise<{ id: string; status: string; amount: number; reference_id: string; notes?: Record<string, string>; payments?: { payment_id: string; status: string; amount: number; method?: string }[] | null }> {
  const r = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}`, { headers: { Authorization: authHeader() } });
  if (!r.ok) throw new RazorpayError(r.status, `RAZORPAY_${r.status}:${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Best effort: a link that must no longer be paid (price changed, booking
 *  rejected, or paid another way). Already paid/expired links just fail. */
export async function cancelPaymentLink(id: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: { Authorization: authHeader() } });
    return r.ok;
  } catch { return false; }
}

/** Callback signature for a payment link redirect:
 *  HMAC-SHA256(link_id|reference_id|status|payment_id, key secret). */
export function verifyPaymentLinkSignature(linkId: string, referenceId: string, status: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !linkId || !paymentId || !signature) return false;
  const expect = crypto.createHmac("sha256", secret).update(`${linkId}|${referenceId}|${status}|${paymentId}`).digest("hex");
  const a = Buffer.from(expect), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Apply a confirmed gateway payment (checkout order OR payment link) — the
 *  same end state finance verification produces (captured + history), so
 *  the sweep sends the receipt, issues the 5% GST invoice and asks for the
 *  bond. Returns null when the booking already carries this payment
 *  (idempotent replay). A SECOND full payment on an already-paid booking is
 *  never applied over the first: it is recorded for a refund and flagged. */
export function applyGatewayPayment(b: Booking, p: {
  paymentId: string; amountInr: number; kind: "full" | "topup"; method?: string;
  orderId?: string; linkId?: string; via: "checkout" | "webhook" | "payment link";
}): { next: Booking; duplicate: boolean } | null {
  if ((b.pay?.history ?? []).some((h) => h.utr === p.paymentId)) return null;
  const dupes = (b.admin as { duplicatePayments?: { paymentId: string }[] }).duplicatePayments ?? [];
  if (dupes.some((d) => d.paymentId === p.paymentId)) return null;

  const now = new Date().toISOString();
  const gateway = `Razorpay${p.method ? ` · ${p.method}` : ""}`;
  const verifiedBy = `Razorpay (${p.via === "checkout" ? "signature + API" : p.via === "payment link" ? "payment link + API" : "webhook"})`;
  const amt = `₹${p.amountInr.toLocaleString("en-IN")}`;
  const admin = { ...(b.admin as Record<string, unknown>) };
  if (p.orderId && gatewayOrderOf(b)?.id === p.orderId) delete admin.rzpOrder;
  if (p.linkId && gatewayLinkOf(b)?.id === p.linkId) delete admin.rzpLink;

  if (p.kind === "topup" && b.pay?.status === "captured" && b.pay.topup) {
    return { duplicate: false, next: {
      ...b, admin,
      pay: { ...b.pay, amount: b.pay.amount + p.amountInr, topup: null,
        history: [...(b.pay.history ?? []), { at: now, amount: p.amountInr, kind: "topup", utr: p.paymentId, verifiedBy }] },
      events: [...b.events, { at: now, by: "customer", text: `✅ Extra-bags payment ${amt} paid online · ${gateway} · ${p.paymentId}` }],
    } };
  }
  if (b.pay?.status === "captured") {
    /* already paid in full — keep the first payment, flag this one for refund */
    return { duplicate: true, next: {
      ...b, admin: { ...admin, duplicatePayments: [...dupes, { paymentId: p.paymentId, amount: p.amountInr, at: now, via: p.via }] },
      events: [...b.events, { at: now, by: "admin", text: `⚠ DUPLICATE payment ${amt} received online (${p.paymentId}) on an already-paid booking — refund it in Razorpay` }],
    } };
  }
  return { duplicate: false, next: {
    ...b, admin,
    pay: { mode: "full", amount: p.amountInr, status: "captured", gateway, at: now, utr: p.paymentId,
      verifiedAt: now, verifiedBy, proof: null, submittedAt: null, rejectedNote: undefined,
      history: [...(b.pay?.history ?? []), { at: now, amount: p.amountInr, kind: "full", utr: p.paymentId, verifiedBy }] },
    events: [...b.events, { at: now, by: "customer", text: `✅ Payment ${amt} paid online · ${gateway} · ${p.paymentId}` }],
  } };
}
