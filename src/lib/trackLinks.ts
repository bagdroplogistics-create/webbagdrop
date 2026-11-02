/** Server-only: signed tracking links and the GPS store.
 *
 *  Links carry the booking id plus an HMAC, so nothing has to be stored to
 *  issue one and nobody can guess another booking's link:
 *    /t/<id>.<sig>           customer / partner tracking (read-only)
 *    /d/<id>.<leg>.<sig>     driver page for one leg (shares GPS)
 *  GPS fixes live in a settings row per booking (`gps:<id>`), never on the
 *  booking document — a phone pinging every 30 s must not bump the booking's
 *  revision and make the team's saves conflict. */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GpsPoint, TrackLeg } from "./tracking";

const SECRET = process.env.QUOTE_SIGNING_SECRET ?? "dev-secret-change-me";
const mac = (payload: string) => createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 22);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ID = /^[A-Z0-9-]{6,40}$/;
const LEGS: TrackLeg[] = ["pickup", "linehaul", "lastmile"];

export const trackToken = (id: string) => `${id}.${mac(`track|${id}`)}`;
export const trackPath = (id: string) => `/t/${trackToken(id)}`;
export function readTrackToken(t: string): string | null {
  const [id, sig, extra] = (t ?? "").split(".");
  if (extra !== undefined || !ID.test(id ?? "") || !sig) return null;
  return same(sig, mac(`track|${id}`)) ? id : null;
}

/** /p/<id>.<sig> — the customer's Move Pass (boarding-pass style). */
export const passToken = (id: string) => `${id}.${mac(`pass|${id}`)}`;
export const passPath = (id: string) => `/p/${passToken(id)}`;
export function readPassToken(t: string): string | null {
  const [id, sig, extra] = (t ?? "").split(".");
  if (extra !== undefined || !ID.test(id ?? "") || !sig) return null;
  return same(sig, mac(`pass|${id}`)) ? id : null;
}

export const driverToken = (id: string, leg: TrackLeg) => `${id}.${leg}.${mac(`drv|${id}|${leg}`)}`;
export const driverPath = (id: string, leg: TrackLeg) => `/d/${driverToken(id, leg)}`;
export function readDriverToken(t: string): { id: string; leg: TrackLeg } | null {
  const [id, leg, sig, extra] = (t ?? "").split(".");
  if (extra !== undefined || !ID.test(id ?? "") || !LEGS.includes(leg as TrackLeg) || !sig) return null;
  return same(sig, mac(`drv|${id}|${leg}`)) ? { id, leg: leg as TrackLeg } : null;
}

/* ---------------- GPS store ---------------- */
export interface GpsDoc { points: GpsPoint[]; sharing?: { leg: TrackLeg; since: string } | null }
const KEEP = 120; // ~1 hour of 30-second fixes

export async function readGps(sb: SupabaseClient, ids: string[]): Promise<Record<string, GpsDoc>> {
  if (!ids.length) return {};
  const { data } = await sb.from("settings").select("id, doc").in("id", ids.map((id) => `gps:${id}`));
  return Object.fromEntries((data ?? []).map((r) => [String(r.id).slice(4), r.doc as GpsDoc]));
}
export const latestFix = (g?: GpsDoc | null): GpsPoint | null => g?.points?.[g.points.length - 1] ?? null;

export async function writeGps(sb: SupabaseClient, id: string, change: (g: GpsDoc) => GpsDoc): Promise<GpsDoc> {
  const cur = (await readGps(sb, [id]))[id] ?? { points: [] };
  const next = change(cur);
  next.points = next.points.slice(-KEEP);
  const { error } = await sb.from("settings").upsert({ id: `gps:${id}`, doc: next, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return next;
}
