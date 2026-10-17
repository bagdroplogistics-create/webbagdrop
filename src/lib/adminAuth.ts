/** Admin session — same shared-secret model as the live bagdrop-web project
 *  (an ADMIN_SECRET_KEY env var, not per-user passwords). Server-only.
 *
 *  Login (`/api/admin/login`) checks the key the admin typed against
 *  ADMIN_SECRET_KEY and, on success, sets an httpOnly cookie containing a
 *  signed, expiring token — never the key itself, so the cookie is useless
 *  if read any other way, and it can't be replayed forever if it leaks.
 *  `requireAdmin` (used by every /api/admin/* route) verifies that token.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_SECRET = process.env.ADMIN_SECRET_KEY ?? "dev-admin-key-change-me";
const COOKIE = "bagdrop_admin";
const SESSION_HOURS = 12;

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

export function checkAdminKey(key: string): boolean {
  const a = Buffer.from(sign(key));
  const b = Buffer.from(sign(process.env.ADMIN_SECRET_KEY ?? "dev-admin-key-change-me"));
  // constant-time compare of two HMACs of equal length, not of the raw key
  return a.length === b.length && timingSafeEqual(a, b) && key.length > 0;
}

export function makeSessionToken(): string {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `admin:${expires}`;
  return `${payload}:${sign(payload)}`;
}

function verifySessionToken(token: string): boolean {
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  const [tag, expiresStr, sig] = parts;
  const payload = `${tag}:${expiresStr}`;
  if (sign(payload) !== sig) return false;
  const expires = Number(expiresStr);
  return tag === "admin" && Number.isFinite(expires) && expires > Date.now();
}

export const ADMIN_COOKIE = COOKIE;
export const ADMIN_COOKIE_MAX_AGE = SESSION_HOURS * 3600;

/** For use inside API route handlers (App Router). Throws nothing; returns
 *  true/false so callers decide the response. */
export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return !!token && verifySessionToken(token);
}

/** For proxy.ts (Next 16's renamed middleware convention), which gets the
 *  request directly rather than via next/headers. Proxy runs on the Node.js
 *  runtime by default in Next 16, so this does the same real HMAC check as
 *  isAdminRequest() above — not just a presence check. */
export function verifyCookieValue(token: string | undefined): boolean {
  return !!token && verifySessionToken(token);
}
