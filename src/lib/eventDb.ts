"use client";
/** Customer-facing data access for the wedding/event pages (/weddings and
 *  /e/[code]). Same security model as src/lib/db.ts — the anon key NEVER
 *  touches the bookings table directly:
 *
 *  - events:   direct anon SELECT is allowed by RLS, but only rows with
 *              status = 'open' (policy anon_read_event in supabase/schema.sql).
 *  - bookings: reads go through the get_booking SECURITY DEFINER RPC
 *              (one row, by unguessable id); creates through create_booking
 *              (see db.ts); the wedding desk's upsert-by-code and the
 *              track-by-mobile search go through server-only API routes
 *              (/api/wedding/*) that use the service role behind their own
 *              guards — the browser still has no path to "give me everything".
 *
 *  Local-demo fallback mirrors the static build's shared/db.js storage
 *  (localStorage "bagdrop:<collection>" maps), so demo data carries over.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BagdropEvent, Booking } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let sb: SupabaseClient | null = null;
if (url && key) sb = createClient(url, key);

export const backend: "supabase" | "local" = sb ? "supabase" : "local";

const POLL_MS = 5000;

function lsMap<T>(col: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem("bagdrop:" + col) ?? "{}"); } catch { return {}; }
}
function lsWrite<T>(col: string, map: Record<string, T>) {
  localStorage.setItem("bagdrop:" + col, JSON.stringify(map));
  if ("BroadcastChannel" in window) {
    const bc = new BroadcastChannel("bagdrop"); bc.postMessage({ col }); bc.close();
  }
}

export async function getEvent(code: string): Promise<BagdropEvent | null> {
  if (sb) {
    const { data, error } = await sb.from("events").select("doc").eq("id", code).maybeSingle();
    if (error) throw error;
    return (data?.doc as BagdropEvent) ?? null;
  }
  return lsMap<BagdropEvent>("events")[code] ?? null;
}

/** Live-ish event doc: polls in Supabase mode (anon has no Realtime under
 *  the tightened RLS), BroadcastChannel/storage events locally. */
export function watchEvent(code: string, cb: (e: BagdropEvent | null) => void): () => void {
  let dead = false;
  const tick = () => { void getEvent(code).then((e) => { if (!dead) cb(e); }).catch(() => { if (!dead) cb(null); }); };
  tick();
  if (sb) {
    const timer = setInterval(tick, POLL_MS);
    return () => { dead = true; clearInterval(timer); };
  }
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("bagdrop") : null;
  bc?.addEventListener("message", tick);
  window.addEventListener("storage", tick);
  return () => { dead = true; bc?.close(); window.removeEventListener("storage", tick); };
}

/** Fetch one booking by its exact id — get_booking RPC (single row, no
 *  enumeration path) in Supabase mode. */
export async function getBookingDoc(id: string): Promise<Booking | null> {
  if (sb) {
    const { data, error } = await sb.rpc("get_booking", { p_id: id });
    if (error) throw error;
    return (data as Booking) ?? null;
  }
  return lsMap<Booking>("bookings")[id] ?? null;
}

export function watchBookingDoc(id: string, cb: (b: Booking | null) => void): () => void {
  let dead = false;
  const tick = () => { void getBookingDoc(id).then((b) => { if (!dead) cb(b); }).catch(() => {}); };
  tick();
  if (sb) {
    const timer = setInterval(tick, 4000);
    return () => { dead = true; clearInterval(timer); };
  }
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("bagdrop") : null;
  bc?.addEventListener("message", tick);
  window.addEventListener("storage", tick);
  return () => { dead = true; bc?.close(); window.removeEventListener("storage", tick); };
}

/** Create-or-update the wedding desk's family booking (the desk keeps one
 *  document per family, keyed by its Y2K-F… code, and re-saves it on edit).
 *  Goes through the server-only /api/wedding/booking route, which verifies
 *  the event is open, that an existing row belongs to the same event AND the
 *  same lead mobile, and keeps status/admin fields server-authoritative. */
export async function saveWeddingBooking(doc: Booking): Promise<Booking> {
  if (backend === "local") {
    const map = lsMap<Booking>("bookings");
    map[doc.id] = doc;
    lsWrite("bookings", map);
    return doc;
  }
  const r = await fetch("/api/wedding/booking", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
  return ((await r.json()).booking ?? doc) as Booking;
}

/** Reduced view of one family's bookings for the landing page tracker. */
export interface TrackRow {
  id: string; status: string; bags: number; from: string; to: string; date: string;
  familyName: string | null; travellerName: string;
}

/** Track-by-mobile for one event. Server-side search (service role behind
 *  /api/wedding/track) that needs the full 10-digit mobile used to book —
 *  no anon listing of the bookings table. */
export async function trackEventBookings(eventCode: string, mobile: string): Promise<TrackRow[]> {
  const digits = String(mobile).replace(/\D/g, "");
  if (backend === "local") {
    return Object.values(lsMap<Booking>("bookings"))
      .filter((d) => d.eventCode === eventCode && (d.traveller?.mobile ?? "").replace(/\D/g, "").includes(digits))
      .map((d) => ({
        id: d.id, status: d.status, bags: d.bags, from: d.from, to: d.to, date: d.date,
        familyName: d.family?.name ?? null, travellerName: d.traveller?.name ?? "",
      }));
  }
  const r = await fetch("/api/wedding/track", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: eventCode, mobile: digits }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
  return ((await r.json()).bookings ?? []) as TrackRow[];
}
