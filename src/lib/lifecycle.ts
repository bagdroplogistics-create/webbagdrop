/** Server-only: cancel and restore. A cancelled booking is never lost — the
 *  stage it was at is stamped on it, and Restore puts it back exactly: same
 *  status, LR, captain, steps done, tags. Both tell the client. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { cancelInfo, settled, type CancelRecord } from "./journey";
import { isPaid } from "./payState";
import { notify, opsNotify, kickSweep } from "./automation";
import type { Booking } from "./types";

export type LifeResult = { ok: true; booking: Booking } | { ok: false; status: number; error: string; detail: string };
const fail = (status: number, error: string, detail: string): LifeResult => ({ ok: false, status, error, detail });

/** The stamp a cancellation carries (also added by the admin save route when
 *  a screen writes status "cancelled" directly, so every cancel is restorable). */
export function cancelStamp(prev: Booking, by: string, reason: string): CancelRecord {
  return { at: new Date().toISOString(), by, reason: reason.trim().slice(0, 300), from: { status: prev.status }, paidAtCancel: isPaid(prev) };
}

export async function cancelBooking(sb: SupabaseClient, id: string, by: string, reason: string): Promise<LifeResult> {
  if (reason.trim().length < 5) return fail(400, "REASON_REQUIRED", "Write why the booking is being cancelled (a few words at least). The client is told this reason.");
  let refused: LifeResult | null = null;
  const next = await mutateBooking(sb, id, (b) => {
    if (b.status === "cancelled") { refused = fail(409, "ALREADY_CANCELLED", "This booking is already cancelled."); return null; }
    if (b.status === "delivered") { refused = fail(409, "DELIVERED", "A delivered booking can't be cancelled."); return null; }
    const stamp = cancelStamp(b, by, reason);
    return {
      ...b, status: "cancelled",
      admin: { ...b.admin, cancel: stamp },
      events: [...b.events, { at: stamp.at, by: "admin", text: `Cancelled by ${by} — ${stamp.reason} (was ${stamp.from.status}; can be restored)` }],
    };
  });
  if (refused) return refused;
  if (!next) return fail(404, "NOT_FOUND", "Booking not found, or it changed at the same moment — try again.");
  await tellClient(next, "booking_cancelled", { reason: cancelInfo(next)!.reason }, `cancel:${next.id}:${cancelInfo(next)!.at}`);
  if (cancelInfo(next)!.paidAtCancel) {
    await opsNotify(`FINANCE · ${next.id} cancelled after payment (${next.traveller.name}, ${next.from} → ${next.to}) — decide the refund in Finance → Payments. Reason: ${cancelInfo(next)!.reason}`, `Refund decision · ${next.id}`, `fin:cancel:${next.id}:${cancelInfo(next)!.at}`).catch(() => 0);
  }
  kickSweep();
  return { ok: true, booking: next };
}

export async function restoreBooking(sb: SupabaseClient, id: string, by: string): Promise<LifeResult> {
  let refused: LifeResult | null = null;
  const next = await mutateBooking(sb, id, (b) => {
    if (b.status !== "cancelled") { refused = fail(409, "NOT_CANCELLED", "This booking isn't cancelled."); return null; }
    const c = cancelInfo(b);
    const status = c?.from?.status && c.from.status !== "cancelled" ? c.from.status : "submitted";
    const now = new Date().toISOString();
    const admin = Object.fromEntries(Object.entries(b.admin).filter(([k]) => k !== "cancel")) as Record<string, unknown>;
    const history = [...((admin.cancelHistory as CancelRecord[] | undefined) ?? []), ...(c ? [{ ...c, restoredAt: now, restoredBy: by }] : [])];
    /* paid before the cancel: finance checks whether a refund went out */
    const financeCheck = c?.paidAtCancel ? { at: now, why: `Restored after a cancellation on ${c.at.slice(0, 10)} — confirm no refund was issued, or re-collect.` } : undefined;
    return {
      ...b, status,
      admin: { ...admin, cancelHistory: history, ...(financeCheck ? { financeCheck } : {}) },
      events: [...b.events, { at: now, by: "admin", text: `Restored by ${by} — back to ${status}${financeCheck ? " · Finance to confirm the payment" : ""}` }],
    };
  });
  if (refused) return refused;
  if (!next) return fail(404, "NOT_FOUND", "Booking not found, or it changed at the same moment — try again.");
  const now = next.events[next.events.length - 1].at;
  await tellClient(next, "booking_restored", {}, `restore:${next.id}:${now}`);
  const fc = (next.admin as { financeCheck?: { why: string } }).financeCheck;
  if (fc) await opsNotify(`FINANCE · ${next.id} restored (${next.traveller.name}) — ${fc.why}`, `Payment to confirm · ${next.id}`, `fin:restore:${next.id}:${now}`).catch(() => 0);
  if (!settled(next)) { /* unpaid: the payment-link pass re-offers the link */ }
  kickSweep();
  return { ok: true, booking: next };
}

async function tellClient(b: Booking, template: string, extra: Record<string, string>, key: string) {
  if (!b.traveller?.mobile && !b.traveller?.email) return;
  await notify(template, { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email },
    { ref: b.id, lane: `${b.from} → ${b.to}`, date: b.date, dashboard: "/account", ...extra }, key).catch(() => 0);
}
