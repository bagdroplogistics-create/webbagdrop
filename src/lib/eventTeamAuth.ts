/** Event company sessions (/event) — server-only. The company's people sign
 *  in with a WhatsApp code to a mobile listed on the event (event.team.mobiles);
 *  the cookie then carries that mobile, HMAC-signed in its own key domain, so
 *  it is never valid as an admin, partner or guest token. Every request
 *  re-reads which events list the mobile, so removing a number from the event
 *  locks that person out at once. */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { serviceClient } from "./supabaseAdmin";
import type { BagdropEvent } from "./types";
import { requiredSecret } from "./secrets";

export const EVENT_COOKIE = "bagdrop_event";
const TTL_MS = 7 * 24 * 3600 * 1000;
const SECRET = () => `event:${requiredSecret("ADMIN_SECRET_KEY", "dev-admin-key")}`;
const sig = (payload: string) => createHmac("sha256", SECRET()).update(payload).digest("hex");

export function makeEventToken(mobile: string): string {
  const payload = `${mobile}|${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sig(payload)}`;
}

export function eventMobileFromCookie(cookieHeader: string | null): string | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${EVENT_COOKIE}=([^;]+)`));
  if (!m) return null;
  const [b64, got] = decodeURIComponent(m[1]).split(".");
  if (!b64 || !got) return null;
  let payload: string;
  try { payload = Buffer.from(b64, "base64url").toString(); } catch { return null; }
  const want = Buffer.from(sig(payload)), have = Buffer.from(got);
  if (want.length !== have.length || !timingSafeEqual(want, have)) return null;
  const [mobile, exp] = payload.split("|");
  return mobile && Number(exp) >= Date.now() ? mobile : null;
}

export const eventCookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: TTL_MS / 1000, path: "/" };

const last10 = (s: string) => s.replace(/\D/g, "").slice(-10);

/** The team member's name for this mobile on these events ("" when only the number is listed). */
export function personFor(events: BagdropEvent[], mobile: string): string {
  const me = last10(mobile);
  for (const e of events) { const p = (e.team?.people ?? []).find((x) => last10(x.mobile) === me); if (p?.name) return p.name; }
  return "";
}

/** The open or closed events whose team lists this mobile. */
type SB = NonNullable<ReturnType<typeof serviceClient>>;
export async function eventsForMobile(sb: SB, mobile: string): Promise<BagdropEvent[]> {
  const { data } = await sb.from("events").select("doc").limit(200);
  const me = last10(mobile);
  return (data ?? []).map((r) => r.doc as BagdropEvent).filter((e) => [...(e.team?.mobiles ?? []), ...(e.team?.people ?? []).map((p) => p.mobile)].some((m) => last10(m) === me));
}
