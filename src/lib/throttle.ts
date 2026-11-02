/** Failed-sign-in counters that hold across serverless instances (settings
 *  rows, status "otpfail", cleared by the daily sweep). One window per key:
 *  `failures(key)` reads the count in the current window, `recordFailure`
 *  adds one. Used by the owner emergency key and partner sign-in. */
import { serviceClient } from "./supabaseAdmin";

const rowId = (key: string, windowMs: number) => `signinfail:${key}:${Math.floor(Date.now() / windowMs)}`;

export async function failures(key: string, windowMs: number): Promise<number> {
  const sb = serviceClient();
  if (!sb) return 0;
  const { data } = await sb.from("settings").select("doc").eq("id", rowId(key, windowMs)).maybeSingle();
  return (data?.doc as { n?: number } | null)?.n ?? 0;
}
export async function recordFailure(key: string, windowMs: number): Promise<number> {
  const sb = serviceClient();
  if (!sb) return 0;
  const n = (await failures(key, windowMs)) + 1;
  await sb.from("settings").upsert({ id: rowId(key, windowMs), doc: { n }, status: "otpfail", created: new Date().toISOString() });
  return n;
}
