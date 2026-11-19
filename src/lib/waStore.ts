/** Storage primitives for the three WhatsApp-automation tables — same
 *  jsonb-doc convention as bookingStore.ts/automation.ts's outbox helpers.
 *  Every function takes `sb` as a parameter (never calls serviceClient()
 *  itself) so this module can be exercised with a hand-rolled mock client
 *  in a unit test, with zero network/DB calls — see
 *  scripts/wa-bot-smoke-test.mjs. Server-only in real use (imported only
 *  from the webhook route, the admin API routes, and waFollowUp.ts). */
import { newToken } from "./supabaseAdmin";
import type { WaConversation, WaConvState, WaEvent, WaMessage } from "./waTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient;

/** "+91 98765-43210" / "9876543210" / "919876543210" → "9876543210".
 *  Same last-10-digits rule the existing ads-lead dedup
 *  (src/app/api/admin/leads/route.ts) already uses. */
export function normalizeMobile(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export async function getConversation(sb: SB, mobile: string): Promise<WaConversation | null> {
  const { data } = await sb.from("wa_conversations").select("doc").eq("id", mobile).maybeSingle();
  return (data?.doc as WaConversation | undefined) ?? null;
}

/** Full replace (the caller always starts from getConversation's result, or
 *  a fresh default) — no compare-and-swap here: one conversation row is
 *  only ever advanced by the single webhook request handling it, or an
 *  admin action, never two writers racing the same customer's turn in
 *  practice. If that ever changes, this is the place to add bookingStore's
 *  CAS pattern. */
export async function saveConversation(sb: SB, conv: WaConversation): Promise<void> {
  const status: WaConvState | "opted_out" = conv.optedOut ? "opted_out" : conv.state;
  const { error } = await sb.from("wa_conversations").upsert({ id: conv.mobile, doc: conv, status, created: conv.createdAt });
  if (error) throw new Error(error.message);
}

export interface ListConversationsOpts { status?: string; search?: string; limit?: number }
export async function listConversations(sb: SB, opts: ListConversationsOpts = {}): Promise<WaConversation[]> {
  let q = sb.from("wa_conversations").select("doc").order("created", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q;
  let rows = (data ?? []).map((r) => r.doc as WaConversation);
  if (opts.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter((c) => c.mobile.includes(s) || (c.name ?? "").toLowerCase().includes(s) || (c.leadId ?? "").toLowerCase().includes(s));
  }
  return rows;
}

/** Idempotent insert — Meta retries webhook delivery, so a message keyed by
 *  its own wamid (inbound) or a generated token (outbound/manual) can never
 *  be double-logged. Mirrors automation.ts's insertRows() pattern exactly,
 *  INCLUDING the count check: the caller (waBot.ts) uses the return value
 *  to tell "first time we've seen this wamid" (true) from "Meta retried the
 *  same webhook delivery" (false) — the latter must skip ALL side effects
 *  (auto-replies, lead creation), not just the message row, or a retried
 *  webhook would double-process a customer's message. */
export async function addMessage(sb: SB, msg: WaMessage, id?: string): Promise<boolean> {
  const rowId = id ?? newToken("WAM", 8);
  const { error, count } = await sb.from("wa_messages").upsert(
    { id: rowId, doc: msg, status: msg.direction, created: msg.at },
    { onConflict: "id", ignoreDuplicates: true, count: "exact" },
  );
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function listMessages(sb: SB, conversationId: string, limit = 200): Promise<WaMessage[]> {
  const { data } = await sb.from("wa_messages").select("doc").eq("doc->>conversationId", conversationId).order("created", { ascending: true }).limit(limit);
  return (data ?? []).map((r) => r.doc as WaMessage);
}

/** Idempotent append to the Automation History log (section C). `key`, when
 *  given, makes this call a no-op on replay (e.g. the same Meta webhook
 *  retry) — otherwise every call gets its own fresh id (most admin-driven
 *  events — takeover, resolve — aren't naturally replayable). */
export async function logEvent(sb: SB, ev: WaEvent, key?: string): Promise<void> {
  const rowId = key ?? newToken("WAE", 8);
  const { error } = await sb.from("wa_events").upsert(
    { id: rowId, doc: ev, status: ev.type, created: ev.at },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export interface ListEventsOpts { type?: string; conversationId?: string; limit?: number }
export async function listEvents(sb: SB, opts: ListEventsOpts = {}): Promise<WaEvent[]> {
  let q = sb.from("wa_events").select("doc").order("created", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.type) q = q.eq("status", opts.type);
  if (opts.conversationId) q = q.eq("doc->>conversationId", opts.conversationId);
  const { data } = await q;
  return (data ?? []).map((r) => r.doc as WaEvent);
}

/** Housekeeping: delete Automation History rows older than `days` — called
 *  at most once/day from waFollowUp.ts's sweep pass, to bound wa_events'
 *  growth given the project's current Supabase-quota constraint. */
export async function pruneOldEvents(sb: SB, days = 90): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  await sb.from("wa_events").delete().lt("created", cutoff);
}
