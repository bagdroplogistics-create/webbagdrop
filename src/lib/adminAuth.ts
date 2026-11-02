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
import { cookies, headers } from "next/headers";
import { ACTOR_HEADER, can, type Actor, type Perm } from "./access";
import { requiredSecret } from "./secrets";

const SESSION_SECRET = requiredSecret("ADMIN_SECRET_KEY", "dev-admin-key-change-me");
const COOKIE = "bagdrop_admin";
const SESSION_HOURS = 12;

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

export function checkAdminKey(key: string): boolean {
  const a = Buffer.from(sign(key));
  const b = Buffer.from(sign(requiredSecret("ADMIN_SECRET_KEY", "dev-admin-key-change-me")));
  // constant-time compare of two HMACs of equal length, not of the raw key
  return a.length === b.length && timingSafeEqual(a, b) && key.length > 0;
}

export function makeSessionToken(): string {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `admin:${expires}`;
  return `${payload}:${sign(payload)}`;
}

/** A team member's session: their user id and account version (a password
 *  reset, disable or "sign out everywhere" bumps it and ends the session). */
export function makeUserToken(id: string, ver: number): string {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `user:${id}:${ver}:${expires}`;
  return `${payload}:${sign(payload)}`;
}

export type Session = { kind: "owner" } | { kind: "user"; id: string; ver: number };
export function parseSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const parts = token.split(":");
  const sig = parts.pop() ?? "";
  const payload = parts.join(":");
  const a = Buffer.from(sign(payload)), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const expires = Number(parts.at(-1));
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  if (parts.length === 2 && parts[0] === "admin") return { kind: "owner" };
  if (parts.length === 4 && parts[0] === "user" && /^[a-z0-9-]{4,40}$/.test(parts[1])) return { kind: "user", id: parts[1], ver: Number(parts[2]) };
  return null;
}
function verifySessionToken(token: string): boolean {
  return parseSessionToken(token) !== null;
}

export const ADMIN_COOKIE = COOKIE;
export const ADMIN_COOKIE_MAX_AGE = SESSION_HOURS * 3600;

/** For use inside API route handlers (App Router). Throws nothing; returns
 *  true/false so callers decide the response. proxy.ts has already checked
 *  the account is active and allowed this request (src/lib/access.ts). */
export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return !!token && verifySessionToken(token);
}

/* ---- read-only department board links ----------------------------------
 * A board token grants exactly one thing: GET /api/board/metrics for ONE
 * department view, until it expires. Same HMAC secret and scheme as the
 * session cookie, but a different payload prefix so neither can stand in
 * for the other. Dots instead of colons so it travels in a URL path. */

export function makeBoardToken(view: string, days: number): string {
  const expires = Date.now() + Math.min(365, Math.max(1, days)) * 86400_000;
  return `${view}.${expires}.${sign(`board:${view}:${expires}`)}`;
}

/** Returns the view key the token grants, or null. */
export function verifyBoardToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [view, expiresStr, sig] = parts;
  if (sign(`board:${view}:${expiresStr}`) !== sig) return null;
  const expires = Number(expiresStr);
  return /^[a-z]{2,8}$/.test(view) && Number.isFinite(expires) && expires > Date.now() ? view : null;
}

/** For proxy.ts (Next 16's renamed middleware convention), which gets the
 *  request directly rather than via next/headers. Proxy runs on the Node.js
 *  runtime by default in Next 16, so this does the same real HMAC check as
 *  isAdminRequest() above — not just a presence check. */
export function verifyCookieValue(token: string | undefined): boolean {
  return !!token && verifySessionToken(token);
}

/** Who is making this request — set by proxy.ts on every /api/admin call
 *  (never taken from the browser). Null outside an admin request. */
export async function currentActor(): Promise<Actor | null> {
  const raw = (await headers()).get(ACTOR_HEADER);
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Actor; } catch { return null; }
}
/** The name to write into history lines ("by"), e.g. "Priya Shah". */
export async function actorName(): Promise<string> {
  return (await currentActor())?.name ?? "BAGDROP OS admin";
}
/** True when the signed-in person has this permission (owner key: always). */
export async function actorCan(p: Perm): Promise<boolean> {
  return can((await currentActor())?.grants, p);
}
