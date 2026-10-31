import { NextResponse } from "next/server";
import type { serviceClient } from "./supabaseAdmin";
import type { Booking } from "./types";

/** Safe booking writes. Every booking document carries a revision number;
 *  a save only lands if the stored copy is still at the revision the writer
 *  read (compare-and-swap). Without this, a slow writer — the automation
 *  sweep, or an admin screen holding a 20-second-old copy — could silently
 *  overwrite a payment verification or a client's edit made in between. */

type SB = NonNullable<ReturnType<typeof serviceClient>>;

export const revOf = (b: Pick<Booking, "rev">) => b.rev ?? 0;

/** Save `next` only if the stored booking is still at `prevRev`. */
export async function casSave(sb: SB, prevRev: number, next: Booking): Promise<"ok" | "conflict" | "error"> {
  const doc: Booking = { ...next, rev: prevRev + 1 };
  const base = sb.from("bookings").update({ doc, status: doc.status }).eq("id", doc.id);
  const q = prevRev === 0 ? base.or("doc->>rev.is.null,doc->>rev.eq.0") : base.eq("doc->>rev", String(prevRev));
  const { data, error } = await q.select("id");
  if (error) return "error";
  return data && data.length > 0 ? "ok" : "conflict";
}

/** Read → change → save, re-reading and re-applying on a concurrent write.
 *  `change` gets the freshest copy and returns the new document, or null to
 *  leave it untouched. */
export async function mutateBooking(sb: SB, id: string, change: (fresh: Booking) => Booking | null, tries = 4): Promise<Booking | null> {
  for (let i = 0; i < tries; i++) {
    const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
    if (!data) return null;
    const fresh = data.doc as Booking;
    const next = change(fresh);
    if (!next) return null;
    const r = await casSave(sb, revOf(fresh), next);
    if (r === "ok") return { ...next, rev: revOf(fresh) + 1 };
    if (r === "error") return null;
  }
  return null;
}

export const conflict = () => NextResponse.json(
  { error: "CONFLICT", detail: "This booking was updated at the same moment — please refresh and try again." },
  { status: 409, headers: { "x-booking-conflict": "1" } },
);

export class BookingConflict extends Error { constructor() { super("BOOKING_CONFLICT"); this.name = "BookingConflict"; } }

/** Wrap a route handler so a write that lost a compare-and-swap race is
 *  simply re-run from the top against the fresh copy (up to 3 times). */
export function retryOnConflict(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await handler(req.clone());
        if (res.headers.get("x-booking-conflict") !== "1") return res;
      } catch (e) {
        if (!(e instanceof BookingConflict)) throw e;
      }
    }
    return conflict();
  };
}

/** Drop-in for `upsert` on an EXISTING booking: compare-and-swap against
 *  the revision `next` was built from (spread from the doc that was read).
 *  On success `next.rev` is advanced so the caller can return it. */
export async function saveBooking(sb: SB, next: Booking): Promise<{ error: { message: string } | null; conflict: boolean }> {
  const prev = revOf(next);
  const r = await casSave(sb, prev, next);
  if (r === "ok") { next.rev = prev + 1; return { error: null, conflict: false }; }
  return r === "conflict" ? { error: { message: "CONFLICT" }, conflict: true } : { error: { message: "SAVE_FAILED" }, conflict: false };
}

/** saveBooking for route handlers wrapped in retryOnConflict: a lost race
 *  throws, and the wrapper re-runs the request against the fresh copy. */
export async function saveOrThrow(sb: SB, next: Booking) {
  const r = await saveBooking(sb, next);
  if (r.conflict) throw new BookingConflict();
  return r;
}
