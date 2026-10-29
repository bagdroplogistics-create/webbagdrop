"use client";
import type { BagdropEvent } from "./types";
import { backend } from "./db";
import type { WeddingEvent } from "./types";

const POLL_MS = 6000;

async function unwrap<T>(r: Response, key: string): Promise<T> {
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j[key] as T;
}

export const listEvents = () => fetch("/api/admin/events").then((r) => unwrap<WeddingEvent[]>(r, "events"));
export const createEvent = (input: Omit<WeddingEvent, "id" | "created" | "status">) =>
  fetch("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).then((r) => unwrap<WeddingEvent>(r, "event"));
export const patchEvent = (id: string, patch: Partial<WeddingEvent>) =>
  fetch("/api/admin/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }) }).then((r) => unwrap<WeddingEvent>(r, "event"));

export function watchEvents(cb: (list: WeddingEvent[]) => void, onError?: (e: unknown) => void): () => void {
  let dead = false;
  const tick = () => { listEvents().then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}


/* ===== next-line admin wedding desk API (merged) ===== */
const LS2 = "bagdrop:events";
function lsRead(): Record<string, BagdropEvent> {
  try { return JSON.parse(localStorage.getItem(LS2) ?? "{}"); } catch { return {}; }
}
function lsList(): BagdropEvent[] {
  return Object.values(lsRead()).sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
}
export async function adminListEvents(): Promise<BagdropEvent[]> {
  if (backend === "local") return lsList();
  const r = await fetch("/api/admin/events");
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
  return ((await r.json()).events ?? []) as BagdropEvent[];
}

export async function adminSaveEvent(doc: BagdropEvent): Promise<void> {
  if (backend === "local") {
    const map = lsRead();
    map[doc.id] = doc;
    localStorage.setItem(LS2, JSON.stringify(map));
    if ("BroadcastChannel" in window) { const bc = new BroadcastChannel("bagdrop"); bc.postMessage({ col: "events" }); bc.close(); }
    return;
  }
  const r = await fetch("/api/admin/events", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
}

export function watchAdminEvents(cb: (list: BagdropEvent[]) => void, onError?: (e: unknown) => void): () => void {
  if (backend === "local") {
    cb(lsList());
    const bc = "BroadcastChannel" in window ? new BroadcastChannel("bagdrop") : null;
    const handler = () => cb(lsList());
    bc?.addEventListener("message", handler);
    window.addEventListener("storage", handler);
    return () => { bc?.close(); window.removeEventListener("storage", handler); };
  }
  let dead = false;
  const tick = () => { adminListEvents().then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}

/** The event-code generator from the static build's shared/db.js —
 *  unambiguous alphabet (no 0/O/1/I/L). */
export function newEventCode(type = "WED"): string {
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${type}-${s}`;
}

/** The Y2K wedding event exactly as the static y2k.html seeded it, so the
 *  desk at /e/y2k and the landing page read the same record. */
export function y2kSeedEvent(): BagdropEvent {
  return {
    id: "Y2K-WED", created: new Date().toISOString(), status: "open",
    name: "Yashna & Yash wedding", type: "WED",
    venueCity: "Udaipur", venue: "Taj Aravali Resort, Udaipur",
    dates: { in: "2026-12-17", out: "2026-12-18" }, direction: "both", billing: "host",
    expected: { families: 40, bags: 120 },
    rates: { oversize: 900, minBags: 2, slabPct: 18, depositPct: 50 },
    sectors: [{ city: "Mumbai", rate: 3500, pickDay: "2026-12-10", retDay: "2026-12-19" }],
    contacts: { host: "Host family", hostMobile: "", planner: "", onsite: "" },
    landing: {
      names: "Yashna & Yash", hashtag: "#Y2K", datesText: "17 & 18 December 2026",
      sides: "Bride side · Groom side", celebration: "Two days in the Aravallis, one forever.",
      destination: "Taj Aravali, Udaipur",
    },
    page: "/e/y2k",
  };
}
