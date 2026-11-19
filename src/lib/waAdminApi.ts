"use client";
/** Client-side data access for the WhatsApp Chatbot & Automation module —
 *  same hand-rolled poll pattern as adminApi.ts/crmApi.ts (no React Query/
 *  SWR anywhere in this project). All three sections (Live Conversations,
 *  Chatbot Settings, Automation History) go through here. */
import type { WaConfig, WaConversation, WaEvent, WaMessage } from "./waTypes";

const POLL_MS = 6000;

async function j<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error ?? `HTTP_${r.status}`);
  return body as T;
}

export async function fetchConversations(opts: { status?: string; q?: string } = {}): Promise<WaConversation[]> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  const r = await fetch(`/api/admin/whatsapp-automation/conversations?${params}`);
  return (await j<{ conversations: WaConversation[] }>(r)).conversations;
}

export function watchConversations(opts: { status?: string; q?: string }, cb: (list: WaConversation[]) => void, onError?: (e: unknown) => void): () => void {
  let dead = false;
  const tick = () => { fetchConversations(opts).then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}

export async function fetchConversation(mobile: string): Promise<{ conversation: WaConversation; messages: WaMessage[] }> {
  const r = await fetch(`/api/admin/whatsapp-automation/conversations/${mobile}`);
  return j(r);
}

async function patchConversation(mobile: string, body: unknown): Promise<{ conversation: WaConversation; messages: WaMessage[] }> {
  const r = await fetch(`/api/admin/whatsapp-automation/conversations/${mobile}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return j(r);
}
export const takeOverConversation = (mobile: string) => patchConversation(mobile, { action: "take_over" });
export const returnConversationToBot = (mobile: string) => patchConversation(mobile, { action: "return_to_bot" });
export const resolveConversation = (mobile: string) => patchConversation(mobile, { action: "resolve" });
export const replyToConversation = (mobile: string, text: string) => patchConversation(mobile, { action: "reply", text });

export async function loadWaSettings(): Promise<WaConfig> {
  const r = await fetch("/api/admin/whatsapp-automation/settings");
  return (await j<{ config: WaConfig }>(r)).config;
}
export async function saveWaSettings(patch: Partial<WaConfig>): Promise<WaConfig> {
  const r = await fetch("/api/admin/whatsapp-automation/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  return (await j<{ config: WaConfig }>(r)).config;
}

export async function fetchHistory(opts: { type?: string; conversationId?: string } = {}): Promise<WaEvent[]> {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.conversationId) params.set("conversationId", opts.conversationId);
  const r = await fetch(`/api/admin/whatsapp-automation/history?${params}`);
  return (await j<{ events: WaEvent[] }>(r)).events;
}
export function watchHistory(opts: { type?: string; conversationId?: string }, cb: (list: WaEvent[]) => void, onError?: (e: unknown) => void): () => void {
  let dead = false;
  const tick = () => { fetchHistory(opts).then((l) => { if (!dead) cb(l); }).catch((e) => { if (!dead) onError?.(e); }); };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return () => { dead = true; clearInterval(timer); };
}
