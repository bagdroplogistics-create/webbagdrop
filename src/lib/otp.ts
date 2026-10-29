/** Stateless booking-time OTP — server-only (node:crypto).
 *
 *  No OTP table: the server issues a 6-digit code plus an HMAC token binding
 *  (destination | code | expiry). The browser never sees the code when a
 *  provider is configured; verification recomputes the HMAC, so a tampered
 *  code, destination or expiry can never pass. Codes die after 10 minutes. */
import { createHmac, timingSafeEqual, randomInt } from "node:crypto";

const SECRET = (process.env.ADMIN_SECRET_KEY ?? "dev-admin-key") + ":otp:v1";
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
