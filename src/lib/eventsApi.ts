"use client";
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
