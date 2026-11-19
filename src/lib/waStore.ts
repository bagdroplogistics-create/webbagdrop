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
 *  its own wamid can never be double-logged, and the caller (waBot.ts)
 *  uses the return value to tell "first time we've seen this wamid" (true)
 *  from "Meta retried the same webhook delivery" (false) — the latter must
 *  skip ALL side effects (auto-replies, lead creation), not just the
 *  message row, or a retried webhook would double-process a customer's
 *  message. Mirrors automation.ts's insertRows() pattern, including the
 *  count check.
 *
 *  `id` is always the caller's choice (never auto-generated here): inbound
 *  rows use the inbound wamid itself; outbound rows use a fresh newToken()
 *  the caller generates BEFORE sending, specifically so it can register
 *  that same id against Meta's returned wamid afterward
 *  (registerSentMessageMapping) and attribute a later delivery-status
 *  callback or media download back to this exact row. */
export async function addMessage(sb: SB, msg: WaMessage, id: string): Promise<boolean> {
  const { error, count } = await sb.from("wa_messages").upsert(
    { id, doc: msg, status: msg.direction, created: msg.at },
    { onConflict: "id", ignoreDuplicates: true, count: "exact" },
  );
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function listMessages(sb: SB, conversationId: string, limit = 200): Promise<WaMessage[]> {
  const { data } = await sb.from("wa_messages").select("doc").eq("doc->>conversationId", conversationId).order("created", { ascending: true }).limit(limit);
  return (data ?? []).map((r) => r.doc as WaMessage);
}

/** Turns each message's stored mediaPath into a short-lived signed URL for
 *  the API response — never persisted, resolved fresh on every request
 *  (same pattern as the identity/payment-proof document routes). Messages
 *  with no mediaPath pass through unchanged. */
export async function resolveMediaUrls(sb: SB, messages: WaMessage[]): Promise<WaMessage[]> {
  return Promise.all(messages.map(async (m) => {
    if (!m.mediaPath) return m;
    const { data } = await sb.storage.from("wa-media").createSignedUrl(m.mediaPath, 300);
    return data?.signedUrl ? { ...m, mediaUrl: data.signedUrl } : m;
  }));
}

/** Attach a downloaded attachment's Storage path to an already-logged
 *  inbound message row (the row is created with just the "[Photo]"-style
 *  placeholder text first, since the download itself is best-effort and
 *  shouldn't delay logging the event — see handleInboundMessage). */
export async function attachMessageMedia(sb: SB, id: string, mediaPath: string, mediaContentType: string): Promise<void> {
  const { data } = await sb.from("wa_messages").select("doc").eq("id", id).maybeSingle();
  if (!data) return;
  const doc = { ...(data.doc as WaMessage), mediaPath, mediaContentType };
  await sb.from("wa_messages").update({ doc }).eq("id", id);
}

/** Maps Meta's wamid (only known once a send is accepted) back to the
 *  wa_messages row id the caller already chose — same "settings" keyed-row
 *  pattern automation.ts's drainPass uses for its own outbox rows (prefix
 *  "wam:" instead of "wa:" so the two can never collide), consumed by the
 *  delivery-status webhook to put a sent/delivered/read tick on the right
 *  conversational message. */
export async function registerSentMessageMapping(sb: SB, wamid: string, messageId: string): Promise<void> {
  await sb.from("settings").upsert({ id: `wam:${wamid}`, doc: { messageId }, status: null, created: new Date().toISOString() });
}

/** Called from the delivery-status webhook loop. Returns true if a row was
 *  actually found/updated, so the caller can fall back to checking the
 *  outbox mapping too (a status event might belong to either). */
export async function updateMessageStatusByWamid(sb: SB, wamid: string, waStatus: WaMessage["waStatus"]): Promise<boolean> {
  const { data: map } = await sb.from("settings").select("doc").eq("id", `wam:${wamid}`).maybeSingle();
  const messageId = (map?.doc as { messageId?: string } | null)?.messageId;
  if (!messageId) return false;
  const { data: row } = await sb.from("wa_messages").select("doc").eq("id", messageId).maybeSingle();
  if (!row) return false;
  await sb.from("wa_messages").update({ doc: { ...(row.doc as WaMessage), waStatus } }).eq("id", messageId);
  return true;
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
