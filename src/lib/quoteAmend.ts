/** Server-only: change a PAID booking's details from the quote desk. The
 *  chart re-prices it; the difference is settled in-house:
 *   price up   → a top-up falls due (the client gets the link)
 *   price down → a credit note is issued (expires like every credit note)
 *  Nothing is silently absorbed, and the client is told either way. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { applyInquiryChanges, type InquiryChanges } from "./inquiryEdit";
import { loadMasters } from "./pricingSettings";
import { isPaid } from "./payState";
import { financialYear } from "./docs";
import { notify, kickSweep } from "./automation";
import { inr } from "./pricing";
import type { Booking } from "./types";

export type AmendResult = { ok: true; booking: Booking; changed: string[]; delta: number; creditNote?: string } | { ok: false; status: number; error: string; detail: string };
const fail = (status: number, error: string, detail: string): AmendResult => ({ ok: false, status, error, detail });

export async function amendPaidQuote(sb: SupabaseClient, id: string, changes: InquiryChanges, by: string, reason: string): Promise<AmendResult> {
  if (reason.trim().length < 5) return fail(400, "REASON_REQUIRED", "Write why the booking is being changed after payment.");
  const masters = await loadMasters();
  let out: { changed: string[]; delta: number; wasTotal: number; newTotal: number } | null = null;
  let refused: AmendResult | null = null;
  let cnNo: string | undefined;
  const next = await mutateBooking(sb, id, (b) => {
    out = null; refused = null;
    if (!isPaid(b)) { refused = fail(409, "NOT_PAID", "Payment isn't verified yet — change it on the quote desk as usual."); return null; }
    if (["picked_up", "in_transit", "delivered", "cancelled", "rejected"].includes(b.status)) { refused = fail(409, "IN_MOTION", `This booking is ${b.status.replace("_", " ")} — the quote can't change now.`); return null; }
    /* the desk lock says "paid → Shipments": this IS that path */
    const unlocked: Booking = { ...b, pay: null };
    const r = applyInquiryChanges(unlocked, changes, masters);
    if (!r.ok) { refused = fail(400, r.error, r.detail); return null; }
    const wasTotal = b.quote.total || 0, newTotal = r.next.quote.breakdown?.ror ? wasTotal : r.next.quote.total;
    if (r.next.quote.breakdown?.ror) { refused = fail(409, "NO_RATE", "That lane has no chart price — set a team price on the quote desk first."); return null; }
    const delta = Math.round(newTotal - wasTotal);
    const paidSoFar = b.pay!.amount;
    const now = new Date().toISOString();
    let pay = { ...b.pay!, topup: b.pay!.topup ?? null };
    if (newTotal > paidSoFar) pay = { ...pay, topup: { amount: Math.round(newTotal - paidSoFar), status: "due", submittedAt: null } };
    else pay = { ...pay, topup: null };
    out = { changed: r.changed, delta, wasTotal, newTotal };
    return { ...r.next, pay, events: [...r.next.events, { at: now, by: "admin", text: `Changed after payment by ${by} — ${reason.trim()} · ${r.changed.join("; ") || "no field changed"}${delta > 0 ? ` · top-up ${inr(newTotal - paidSoFar)} due` : delta < 0 ? ` · credit note ${inr(-delta)} to issue` : ""}` }] };
  });
  if (refused) return refused;
  if (!next || !out) return fail(404, "NOT_FOUND", "Booking not found, or it changed at the same moment — try again.");
  const o = out as { changed: string[]; delta: number; wasTotal: number; newTotal: number };
  const to = { name: next.traveller.name, mobile: next.traveller.mobile, email: next.traveller.email };
  const d = { ref: next.id, lane: `${next.from} → ${next.to}`, amount: inr(Math.abs(o.delta)), total: inr(o.newTotal), dashboard: "/account", changes: o.changed.join("; ") };
  if (o.delta < 0) {
    /* credit note, numbered race-safe like the Finance desk's */
    const { data: no } = await sb.rpc("next_doc_no", { p_type: "CN", p_fy: financialYear() });
    cnNo = String(no);
    const expires = new Date(Date.now() + 180 * 86400e3).toISOString().slice(0, 10);
    const { data } = await sb.from("settings").select("doc").eq("id", "creditnotes").maybeSingle();
    const notes = ((data?.doc as { notes?: unknown[] })?.notes ?? []) as unknown[];
    notes.push({ id: cnNo, bookingId: next.id, customer: next.traveller.name, mobile: next.traveller.mobile, amount: -o.delta, reason: `Booking changed after payment: ${reason.trim()}`, issuedAt: new Date().toISOString(), expiresAt: expires, status: "active" });
    await sb.from("settings").upsert({ id: "creditnotes", doc: { notes }, status: null, created: new Date().toISOString() });
    await mutateBooking(sb, id, (f) => ({ ...f, docs: [...(f.docs ?? []), { type: "CN", no: cnNo!, at: new Date().toISOString(), amount: -o.delta }] }));
    await notify("quote_amended_credit", to, { ...d, cn: cnNo, expires }, `amend:${next.id}:${Date.now()}`).catch(() => 0);
  } else if (o.delta > 0) {
    await notify("quote_amended_topup", to, d, `amend:${next.id}:${Date.now()}`).catch(() => 0);
  } else {
    await notify("quote_amended_same", to, d, `amend:${next.id}:${Date.now()}`).catch(() => 0);
  }
  kickSweep();
  const fresh = (await sb.from("bookings").select("doc").eq("id", id).maybeSingle()).data?.doc as Booking | undefined;
  return { ok: true, booking: fresh ?? next, changed: o.changed, delta: o.delta, creditNote: cnNo };
}
