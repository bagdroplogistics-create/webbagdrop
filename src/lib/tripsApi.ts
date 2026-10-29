"use client";
/** Admin-side trips data access — same polling pattern as adminApi.ts. */
import type { Trip } from "./types";

const POLL_MS = 5000;

export async function listTrips(): Promise<Trip[]> {
  const r = await fetch("/api/admin/trips");
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
  return ((await r.json()).trips ?? []) as Trip[];
}

export async function createTrip(input: { route: string; date: string; vehicle: string; vehicleType: string; driver: string; driverMobile: string }): Promise<Trip> {
  const r = await fetch("/api/admin/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j.trip as Trip;
}

export async function patchTrip(id: string, patch: Partial<Trip>): Promise<Trip> {
  const r = await fetch("/api/admin/trips", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j.trip as Trip;
}

export type { LrDetails } from "./lrModel";
import type { LrDetails } from "./lrModel";

export async function assignBookingToTrip(bookingId: string, tripId: string, lr?: LrDetails, opts?: { autoTrip?: boolean; approveDraft?: boolean }) {
  const r = await fetch("/api/admin/trips/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, tripId: tripId || undefined, lr, ...opts }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
  return j.booking;
}

export async function unassignBooking(bookingId: string) {
  const r = await fetch("/api/admin/trips/assign", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j.booking;
}

export function watchTrips(cb: (list: Trip[]) => void, onError?: (e: unknown) => void): () => void {
  let dead = false;
  const tick = () => { listTrips().then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}
