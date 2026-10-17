"use client";
/** Admin-side CRM data access — same polling pattern as adminApi.ts/tripsApi.ts. */
import type { CrmActivity, Inquiry } from "./types";

const POLL_MS = 6000;

async function unwrap<T>(r: Response, key: string): Promise<T> {
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j[key] as T;
}

export const listInquiries = () => fetch("/api/admin/inquiries").then((r) => unwrap<Inquiry[]>(r, "inquiries"));
export const setInquiryStatus = (id: string, status: Inquiry["status"]) =>
  fetch("/api/admin/inquiries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).then((r) => unwrap<Inquiry>(r, "inquiry"));

export const listCrmActivity = () => fetch("/api/admin/crm").then((r) => unwrap<CrmActivity[]>(r, "activity"));
export const logActivity = (entry: Omit<CrmActivity, "id" | "created">) =>
  fetch("/api/admin/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).then((r) => unwrap<CrmActivity>(r, "activity"));
export const markActivityDone = (id: string) =>
  fetch("/api/admin/crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then((r) => unwrap<CrmActivity>(r, "activity"));

export function watchInquiries(cb: (list: Inquiry[]) => void, onError?: (e: unknown) => void): () => void {
  let dead = false;
  const tick = () => { listInquiries().then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}

export function watchCrmActivity(cb: (list: CrmActivity[]) => void, onError?: (e: unknown) => void): () => void {
  let dead = false;
  const tick = () => { listCrmActivity().then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}
