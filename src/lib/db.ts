"use client";
/** Customer-facing data layer: Supabase when NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY
 *  are set, localStorage demo otherwise.
 *
 *  Unlike the original prototype, this does NOT read/write the `bookings`
 *  table directly with the anon key — that let any visitor list or edit any
 *  booking (see supabase/schema.sql's comment block). Every call here goes
 *  through SECURITY DEFINER Postgres functions that only ever touch the one
 *  row whose id was passed in: create_booking, get_booking,
 *  update_booking_customer. There is no anon path to "give me everything."
 *
 *  Realtime push also doesn't work for anon in this model (Realtime is
 *  gated by the same RLS that now denies anon table access), so `watchBooking`
 *  polls get_booking every few seconds instead — plenty fast for a status
 *  page, and still instant in local-demo mode (BroadcastChannel).
 *
 *  Admin (listing/mutating ALL bookings) is a separate, server-only path —
 *  see src/app/api/admin and src/lib/adminAuth.ts. It is not in this file.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Booking } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EDITABLE: Booking["status"][] = ["quoted", "identified", "submitted", "revised"];
const POLL_MS = 4000;

let sb: SupabaseClient | null = null;
if (url && key) sb = createClient(url, key);

export const backend: "supabase" | "local" = sb ? "supabase" : "local";

const LS = "bagdrop:bookings";

function lsRead(): Record<string, Booking> {
  try { return JSON.parse(localStorage.getItem(LS) ?? "{}"); } catch { return {}; }
}
function lsWrite(map: Record<string, Booking>) { localStorage.setItem(LS, JSON.stringify(map)); }
function lsNotify(id: string) {
  if ("BroadcastChannel" in window) { const bc = new BroadcastChannel("bagdrop"); bc.postMessage({ id }); bc.close(); }
}

export function newBookingId(): string {
  return `BD-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`;
}
export const nowIso = () => new Date().toISOString();

/** Creates a brand-new booking. In Supabase mode the real id is assigned
 *  server-side (gen_booking_id() in schema.sql) — the id on `doc` is only a
 *  placeholder and the returned document is the one to use from here on. */
export async function createBooking(doc: Booking): Promise<Booking> {
  if (sb) {
    const { data, error } = await sb.rpc("create_booking", { p_doc: doc });
    if (error) throw error;
    return data as Booking;
  }
  const map = lsRead();
  map[doc.id] = doc;
  lsWrite(map);
  lsNotify(doc.id);
  return doc;
}

/** Applies a partial update to an existing booking the customer already
 *  knows the id of (e.g. marking a shared quote link as paid). Refused
 *  server-side once the booking has left the editable statuses. */
export async function updateBooking(id: string, patch: Partial<Booking>, event?: string): Promise<Booking> {
  if (sb) {
    const { data, error } = await sb.rpc("update_booking_customer", { p_id: id, p_patch: patch, p_event: event ?? null });
    if (error) throw error;
    return data as Booking;
  }
  const map = lsRead();
  const cur = map[id];
  if (!cur) throw new Error("NOT_FOUND");
  if (!EDITABLE.includes(cur.status)) throw new Error("NOT_EDITABLE");
  const next: Booking = { ...cur, ...patch };
  if (event) next.events = [...cur.events, { at: nowIso(), by: "customer", text: event }];
  map[id] = next;
  lsWrite(map);
  lsNotify(id);
  return next;
}

export async function getBooking(id: string): Promise<Booking | null> {
  if (sb) {
    const { data, error } = await sb.rpc("get_booking", { p_id: id });
    if (error) throw error;
    return (data as Booking) ?? null;
  }
  return lsRead()[id] ?? null;
}

/** Live status for one booking: polls in Supabase mode (Realtime isn't
 *  available to anon under the tightened RLS), instant via BroadcastChannel
 *  in local-demo mode. */
export function watchBooking(id: string, cb: (b: Booking | null) => void): () => void {
  if (sb) {
    let dead = false;
    void getBooking(id).then((b) => { if (!dead) cb(b); });
    const timer = setInterval(() => { void getBooking(id).then((b) => { if (!dead) cb(b); }); }, POLL_MS);
    return () => { dead = true; clearInterval(timer); };
  }
  cb(lsRead()[id] ?? null);
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("bagdrop") : null;
  const handler = () => cb(lsRead()[id] ?? null);
  bc?.addEventListener("message", handler);
  window.addEventListener("storage", handler);
  return () => { bc?.close(); window.removeEventListener("storage", handler); };
}
