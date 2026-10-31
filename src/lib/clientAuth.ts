/** Customer (client) sessions — server-only. A client proves a mobile or
 *  email with an OTP; the session cookie then carries that identity, HMAC-
 *  signed with its own key domain (never valid as an admin or partner
 *  token). There are no passwords. A booking belongs to a client when its
 *  traveller mobile or email matches the signed identity. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cleanEmail, cleanMobile } from "./otp";
import type { Booking } from "./types";

export const CLIENT_COOKIE = "bagdrop_client";
const TTL_MS = 14 * 24 * 3600 * 1000;
const SECRET = () => `client:${process.env.ADMIN_SECRET_KEY ?? "dev-admin-key"}`;
const sig = (payload: string) => createHmac("sha256", SECRET()).update(payload).digest("hex");

export interface ClientIdentity { kind: "m" | "e"; value: string }

/** Normalise an OTP destination (as /api/otp echoed it) into an identity. */
export function identityFor(dest: string): ClientIdentity | null {
  const m = cleanMobile(dest);
  if (m) return { kind: "m", value: m };
  const e = cleanEmail(dest);
  if (e) return { kind: "e", value: e };
  return null;
}

export function makeClientToken(id: ClientIdentity): string {
  const payload = `${id.kind}|${id.value}|${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sig(payload)}`;
}

export function clientFromCookie(cookieHeader: string | null): ClientIdentity | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${CLIENT_COOKIE}=([^;]+)`));
  if (!m) return null;
  const [b64, got] = decodeURIComponent(m[1]).split(".");
  if (!b64 || !got) return null;
  let payload: string;
  try { payload = Buffer.from(b64, "base64url").toString(); } catch { return null; }
  const want = Buffer.from(sig(payload)), have = Buffer.from(got);
  if (want.length !== have.length || !timingSafeEqual(want, have)) return null;
  const [kind, value, exp] = payload.split("|");
  if ((kind !== "m" && kind !== "e") || !value || Number(exp) < Date.now()) return null;
  return { kind, value };
}

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: TTL_MS / 1000, path: "/" };

/** Does this booking belong to the signed-in client? */
export function ownsBooking(id: ClientIdentity, b: Booking): boolean {
  if (id.kind === "m") return cleanMobile(b.traveller.mobile) === id.value;
  return !!b.traveller.email && cleanEmail(b.traveller.email) === id.value;
}
