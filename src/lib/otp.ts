/** Stateless booking-time OTP — server-only (node:crypto).
 *
 *  No OTP table: the server issues a 6-digit code plus an HMAC token binding
 *  (destination | code | expiry). The browser never sees the code when a
 *  provider is configured; verification recomputes the HMAC, so a tampered
 *  code, destination or expiry can never pass. Codes die after 10 minutes. */
import { createHmac, timingSafeEqual, randomInt } from "node:crypto";
import { requiredSecret } from "./secrets";
import { serviceClient } from "./supabaseAdmin";

const SECRET = requiredSecret("ADMIN_SECRET_KEY", "dev-admin-key") + ":otp:v1";
export const OTP_TTL_MS = 10 * 60 * 1000;

function mac(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function issueOtp(to: string): { code: string; exp: number; token: string } {
  const code = String(randomInt(100000, 1000000));
  const exp = Date.now() + OTP_TTL_MS;
  return { code, exp, token: mac(`${to.toLowerCase()}|${code}|${exp}`) };
}

export function checkOtp(to: string, code: string, exp: number, token: string): boolean {
  if (!to || !code || !exp || !token || Date.now() > exp) return false;
  const want = Buffer.from(mac(`${to.toLowerCase()}|${code.trim()}|${exp}`), "hex");
  let got: Buffer;
  try { got = Buffer.from(token, "hex"); } catch { return false; }
  return want.length === got.length && timingSafeEqual(want, got);
}

/** checkOtp with a guess limit: after OTP_MAX_TRIES wrong codes against one
 *  issued code, that code is dead (even the right digits) and the person
 *  asks for a new one — so a 6-digit code can't be guessed in its 10 minutes.
 *  Tries are counted in a settings row per issued code ("otpfail:<token>"). */
export const OTP_MAX_TRIES = 5;
export async function checkOtpLimited(to: string, code: string, exp: number, token: string): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/i.test(String(token))) return false;
  const sb = serviceClient();
  const id = `otpfail:${String(token).slice(0, 40)}`;
  const { data } = sb ? await sb.from("settings").select("doc").eq("id", id).maybeSingle() : { data: null };
  const tries = (data?.doc as { n?: number } | null)?.n ?? 0;
  if (tries >= OTP_MAX_TRIES) return false;
  if (checkOtp(to, code, exp, token)) return true;
  if (sb) await sb.from("settings").upsert({ id, doc: { n: tries + 1, exp }, status: "otpfail", created: new Date().toISOString() });
  return false;
}

/** Normalisers shared by the OTP route and the wizard's server paths. */
export function cleanMobile(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return null;
}
export function cleanEmail(raw: string): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}
