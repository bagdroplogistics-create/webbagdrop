/** Razorpay Payment Links for bookings — server-only.
 *
 *  One open link per booking (admin.rzpLink), always for what is due right
 *  now: the approved total, or the extra-bags top-up once paid. The amount
 *  is taken from the booking, never from a browser. A paid link is
 *  confirmed three ways, all idempotent (the payment id is recorded once):
 *    1. the customer's signed redirect back  (/api/payment-link/callback)
 *    2. the webhook payment_link.paid         (/api/hooks/razorpay)
 *    3. the automation sweep polling open links (safety net)
 *  Confirmation always re-reads the link AND the payment from Razorpay. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { decisionOf } from "./clientView";
import { isPaid } from "./payState";
import {
  applyGatewayPayment, cancelPaymentLink, createPaymentLink, fetchPayment, fetchPaymentLink,
  gatewayLinkOf, razorpayConfigured, type GatewayLink,
} from "./razorpay";
import type { Booking } from "./types";

const LINK_DAYS = 7;

/** What this booking owes right now, or why it owes nothing. */
export function dueFor(b: Booking): { kind: "full" | "topup"; amount: number } | { error: string } {
  if (["rejected", "cancelled", "delivered"].includes(b.status)) return { error: "CLOSED" };
  if (isPaid(b)) {
    const t = b.pay?.topup;
    return t && t.status !== "submitted" ? { kind: "topup", amount: t.amount } : { error: "NOTHING_DUE" };
  }
  if (b.pay?.status === "submitted") return { error: "UNDER_VERIFICATION" };
  if (decisionOf(b).state !== "approved" && !b.payer) return { error: "NOT_APPROVED" };
  if (b.quote.breakdown?.ror || !(b.quote.total > 0)) return { error: "NOT_PRICED" };
  return { kind: "full", amount: b.quote.total };
}

const base = (origin: string) => (process.env.SITE_URL || origin).replace(/\/$/, "");

/** The open link for what is due now — reused when still right, otherwise
 *  the old one is cancelled and a fresh one created and stored. */
export async function ensurePaymentLink(sb: SupabaseClient, bookingId: string, origin: string): Promise<GatewayLink | { error: string; detail?: string }> {
  if (!razorpayConfigured()) return { error: "GATEWAY_NOT_CONFIGURED" };
  const { data } = await sb.from("bookings").select("doc").eq("id", bookingId).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b) return { error: "NOT_FOUND" };
  const due = dueFor(b);
  if ("error" in due) return due;

  const open = gatewayLinkOf(b);
  const now = Math.floor(Date.now() / 1000);
  if (open && open.kind === due.kind && open.amount === due.amount && open.expireBy - now > 3600) return open;
  if (open) await cancelPaymentLink(open.id);

  const expireBy = now + LINK_DAYS * 86400;
  let created: { id: string; url: string };
  try {
    created = await createPaymentLink({
      amountInr: due.amount, expireBy,
      referenceId: `${b.id}-${due.kind === "topup" ? "T" : "F"}${now.toString(36)}`,
      description: `${due.kind === "topup" ? "Extra bags · " : ""}Bagdrop ${b.id} · ${b.from} → ${b.to} · pickup ${b.date || "TBC"}`,
      callbackUrl: `${base(origin)}/api/payment-link/callback`,
      customer: { name: b.traveller.name, contact: b.traveller.mobile, email: b.traveller.email || undefined },
      notes: { bookingId: b.id, kind: due.kind },
    });
  } catch (e) {
    return { error: "GATEWAY_ERROR", detail: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
  const link: GatewayLink = { id: created.id, url: created.url, amount: due.amount, kind: due.kind, at: new Date().toISOString(), expireBy };
  const saved = await mutateBooking(sb, b.id, (fresh) => {
    const d = dueFor(fresh);
    return "error" in d || d.amount !== due.amount || d.kind !== due.kind ? null
      : { ...fresh, admin: { ...fresh.admin, rzpLink: link } };
  });
  if (!saved) { await cancelPaymentLink(created.id); return { error: "CHANGED", detail: "The booking changed while the link was being made — try again." }; }
  return link;
}

/** Cancel and forget a booking's open link (price changed, rejected, …). */
export async function dropPaymentLink(sb: SupabaseClient, b: Booking): Promise<void> {
  const open = gatewayLinkOf(b);
  if (!open) return;
  await cancelPaymentLink(open.id);
  await mutateBooking(sb, b.id, (fresh) => {
    if (gatewayLinkOf(fresh)?.id !== open.id) return null;
    const admin = { ...(fresh.admin as Record<string, unknown>) };
    delete admin.rzpLink;
    return { ...fresh, admin };
  });
}

export type LinkResult =
  | { status: "applied"; booking: Booking; kind: "full" | "topup"; amount: number; paymentId: string; method?: string; duplicate: boolean }
  | { status: "already" | "pending" | "mismatch" | "error"; detail?: string };

/** Confirm a link payment from Razorpay's own records and apply it. */
export async function confirmLinkPayment(sb: SupabaseClient, bookingId: string, linkId: string, via: "payment link" | "webhook" = "payment link"): Promise<LinkResult> {
  const { data } = await sb.from("bookings").select("doc").eq("id", bookingId).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b) return { status: "error", detail: "BOOKING_NOT_FOUND" };

  let pl: Awaited<ReturnType<typeof fetchPaymentLink>>;
  try { pl = await fetchPaymentLink(linkId); } catch (e) { return { status: "error", detail: e instanceof Error ? e.message : String(e) }; }
  if (pl.notes?.bookingId !== b.id) return { status: "mismatch", detail: "LINK_NOT_FOR_THIS_BOOKING" };
  const paid = (pl.payments ?? []).find((x) => x.status === "captured");
  if (pl.status !== "paid" || !paid) return { status: "pending", detail: pl.status };
  if ((b.pay?.history ?? []).some((h) => h.utr === paid.payment_id)) return { status: "already" };

  const p = await fetchPayment(paid.payment_id).catch(() => null);
  if (!p || p.status !== "captured" || p.amount !== pl.amount) return { status: "mismatch", detail: "PAYMENT_NOT_CAPTURED_FOR_LINK_AMOUNT" };
  const amount = pl.amount / 100;
  const kind = (pl.notes?.kind === "topup" ? "topup" : "full") as "full" | "topup";
  /* money received on ANY link of this booking is recorded (an older link
   * paid just before it was replaced included); a second full payment is
   * flagged for refund by applyGatewayPayment, never applied over the first */

  let duplicate = false;
  const saved = await mutateBooking(sb, b.id, (fresh) => {
    const r = applyGatewayPayment(fresh, { paymentId: p.id, amountInr: amount, kind, method: p.method, linkId, orderId: p.order_id, via });
    duplicate = !!r?.duplicate;
    return r?.next ?? null;
  });
  if (!saved) return { status: "already" };
  return { status: "applied", booking: saved, kind, amount, paymentId: p.id, method: p.method, duplicate };
}
