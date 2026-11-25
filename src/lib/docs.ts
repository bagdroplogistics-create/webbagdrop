/** Shared document helpers — GST split and financial-year string, used by
 *  LR/trips and Finance. Doc numbers themselves come from the database's
 *  next_doc_no(type, fy) function (race-safe, see supabase/schema.sql) —
 *  call it via a service-role client, never generate numbers client-side. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Booking, DocType } from "./types";
import { isHostBilled } from "./payState";

export const GST_RATE = 0.05;
export const SAC = "9965";

/** The one place that calls next_doc_no — race-safe, server-only (service
 *  role). Returns the stored form, e.g. "PI/2026-27/0007"; both
 *  src/app/api/admin/finance/doc/route.ts and the auto-estimate-on-accept
 *  path in src/app/api/admin/decision/route.ts share this instead of each
 *  inlining the RPC call. */
export async function nextDocNo(sb: SupabaseClient, type: DocType, fy = financialYear()): Promise<string> {
  const { data, error } = await sb.rpc("next_doc_no", { p_type: type, p_fy: fy });
  if (error) throw error;
  return String(data);
}

/** Issues (or refreshes) a booking's Estimate/"PI" doc — the customer-ready
 *  quotation PDF (numbered QT/… for display, see estimateDisplayNo below).
 *  Shared by the auto-estimate-on-approve step (decision/route.ts) and
 *  admin-made quotes (quotes/route.ts), so a priced, non-hosted quote gets
 *  a downloadable Estimate the moment it's created — not only once it's
 *  later approved. Idempotent: the SAME number is kept if one already
 *  exists; only the amount/date/by are refreshed when the price has moved
 *  since (never a second estimate for one booking). No-op for host-billed
 *  bookings (hosts pay — the family is never shown a price) or a zero /
 *  rate-on-request total — never blocks the caller's own save if the
 *  numbering RPC fails, since a numbering hiccup here shouldn't stop a
 *  quote or an approval from going through. */
export async function issueEstimate(sb: SupabaseClient, booking: Booking, by: string): Promise<Booking> {
  if (isHostBilled(booking) || !(booking.quote.total > 0)) return booking;
  try {
    const existing = (booking.docs ?? []).find((d) => d.type === "PI");
    const now = new Date().toISOString();
    if (!existing) {
      const no = await nextDocNo(sb, "PI");
      return { ...booking, docs: [...(booking.docs ?? []), { type: "PI", no, at: now, amount: booking.quote.total, by }] };
    }
    if (existing.amount !== booking.quote.total) {
      return { ...booking, docs: booking.docs!.map((d) => (d === existing ? { ...d, amount: booking.quote.total, at: now, by } : d)) };
    }
    return booking;
  } catch (e) {
    console.error("Estimate auto-issue failed:", e instanceof Error ? e.message : e);
    return booking;
  }
}

/** The "PI" doc type is stored and numbered exactly like every other
 *  race-safe document (so Finance's existing invoice-numbering plumbing
 *  never needs a second sequence) but the customer-facing document is an
 *  "Estimate" — bagdrop.co's own live quotes are numbered "QT/…", not
 *  "PI/…", so the stored number is reformatted for display only; the
 *  underlying `doc.no` (what's actually unique/race-safe) never changes. */
export function estimateDisplayNo(storedNo: string): string {
  return storedNo.replace(/^PI\//, "QT/");
}

/** Apr–Mar Indian financial year string, e.g. "2026-27". */
export function financialYear(d: Date = new Date()): string {
  const y = d.getMonth() >= 3 /* Apr */ ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** gst = the figure the quote engine already computed (preferred, since
 *  slab/peak adjustments change the taxable base) · falls back to backing
 *  it out of the total at GST_RATE if that figure isn't available. */
export function gstSplit(totalOrBooking: number | Booking): { taxable: number; gst: number; total: number } {
  const total = typeof totalOrBooking === "number" ? totalOrBooking : totalOrBooking.quote.total;
  const breakdownGst = typeof totalOrBooking === "number" ? undefined : totalOrBooking.quote.breakdown?.gst;
  const gst = breakdownGst ?? Math.round(total - total / (1 + GST_RATE));
  return { taxable: total - gst, gst, total };
}

/** Credit-note math is intentionally the other order (taxable rounded
 *  first) — matches the static build's accounting convention. */
export function gstSplitFromAmount(amount: number): { taxable: number; gst: number; amount: number } {
  const taxable = Math.round(amount / (1 + GST_RATE));
  return { taxable, gst: amount - taxable, amount };
}
