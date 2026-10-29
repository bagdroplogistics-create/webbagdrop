"use client";
/** Admin-side data access: ALL bookings, full write access. Only usable from
 *  pages behind the admin login (middleware.ts enforces this for /admin and
 *  for these two fetches' target routes, which also re-check the session
 *  server-side). In local-demo mode (no Supabase configured) it falls back
 *  to the same localStorage store the customer pages use, same as before —
 *  there's no real access control to bypass in that mode since nothing
 *  leaves the browser. */
import { backend, nowIso } from "./db";
import type { Booking } from "./types";

const LS = "bagdrop:bookings";
const POLL_MS = 5000;

function lsRead(): Record<string, Booking> {
  try { return JSON.parse(localStorage.getItem(LS) ?? "{}"); } catch { return {}; }
}
function lsList(): Booking[] {
  return Object.values(lsRead()).sort((a, b) => b.created.localeCompare(a.created));
}

export async function adminListBookings(): Promise<Booking[]> {
  if (backend === "local") return lsList();
  const r = await fetch("/api/admin/bookings");
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
  return ((await r.json()).bookings ?? []) as Booking[];
}

export async function adminSaveBooking(doc: Booking): Promise<void> {
  if (backend === "local") {
    const map = lsRead();
    map[doc.id] = doc;
    localStorage.setItem(LS, JSON.stringify(map));
    if ("BroadcastChannel" in window) { const bc = new BroadcastChannel("bagdrop"); bc.postMessage({ id: doc.id }); bc.close(); }
    return;
  }
  const r = await fetch("/api/admin/bookings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({} as { error?: string; detail?: string }));
    throw new Error(j?.detail ?? j?.error ?? `HTTP_${r.status}`);
  }
}

/** Admin's own "with an appended event" convenience, mirroring the old
 *  Inbox.tsx helper but going through adminSaveBooking. */
export async function adminApplyPatch(b: Booking, patch: Partial<Booking>, event: string): Promise<void> {
  await adminSaveBooking({ ...b, ...patch, events: [...b.events, { at: nowIso(), by: "admin", text: event }] });
}

/** Live list for the admin inbox: polls the server in Supabase mode
 *  (simplest reliable option behind a cookie-gated route — see
 *  src/app/api/admin/bookings), instant via BroadcastChannel locally. */
export function watchAdminBookings(cb: (list: Booking[]) => void, onError?: (e: unknown) => void): () => void {
  if (backend === "local") {
    cb(lsList());
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("bagdrop") : null;
    const handler = () => cb(lsList());
    bc?.addEventListener("message", handler);
    window.addEventListener("storage", handler);
    return () => { bc?.close(); window.removeEventListener("storage", handler); };
  }
  let dead = false;
  const tick = () => { adminListBookings().then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}
