/** Server-only: the SITA Bag Journey connector, both directions.
 *
 *  OUT (blueprint I-3, I-5): every custody entry on a POC booking is sent as
 *  a Bag Journey event under its custom code (config.bagJourney.codes). The
 *  sweep runs bagJourneyPass; failures retry on bjBackoffMs up to maxTries.
 *  Only the entry's `bj` status is ever written back, so the ledger stays
 *  append-only. No passenger name, phone or address leaves Bagdrop.
 *
 *  IN (I-2, I-4, I-6, I-7): handleInbound takes SITA's events: a tag printed
 *  at a Flexbox, airline/airport scans of our bags, exceptions, device
 *  status. Each event id is processed once.
 *
 *  Transport: SITA's interface isn't published to us yet, so the default is
 *  a STAND-IN that records each message in the settings table (status
 *  "bjstandin") exactly as it would be sent. "live" posts to
 *  BAG_JOURNEY_URL with BAG_JOURNEY_TOKEN once SITA shares the spec; until
 *  those are set, live sends wait without using up their retries. */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { opsOf } from "./opsModel";
import { activeTags, airportOf, carrierOf, isExceptionKind, linkTag, type AirportPocConfig, type AirportState } from "./airportPoc";
import { bjBackoffMs, custodyEvent, withCustody, type CustodyEvent } from "./custody";
import { loadPocConfig } from "./airportServer";
import type { Booking } from "./types";

export interface BjOutbound {
  msgId: string; booking: string; code: string; bdCode: string; at: string; place: string;
  pieces: { piece: number; bdPlate: string | null; lp: string | null }[];
  seals?: string[]; note?: string;
}
type SendResult = { ok: true; ref: string } | { ok: false; err: string; retry: boolean };

export function outboundOf(b: Booking, e: CustodyEvent, cfg: AirportPocConfig): BjOutbound {
  const o = opsOf(b), tags = activeTags(airportOf(b));
  return {
    msgId: e.id, booking: b.id, code: cfg.bagJourney.codes[e.code], bdCode: e.code, at: e.at, place: e.place,
    pieces: e.pieces.map((n) => ({ piece: n, bdPlate: o.bags?.find((x) => x.n === n)?.plate ?? null, lp: e.tags?.[0] && e.pieces.length === 1 ? e.tags[0] : tags.find((t) => t.n === n)?.lp ?? null })),
    ...(e.seals?.length ? { seals: e.seals } : {}), ...(e.note ? { note: e.note.slice(0, 120) } : {}),
  };
}

async function send(sb: SupabaseClient, cfg: AirportPocConfig, m: BjOutbound): Promise<SendResult> {
  if (cfg.bagJourney.mode === "standin") {
    const at = new Date().toISOString();
    const { error } = await sb.from("settings").upsert({ id: `bjsi:${m.msgId}`, doc: { ...m, receivedAt: at }, status: "bjstandin", created: at });
    return error ? { ok: false, err: error.message, retry: true } : { ok: true, ref: `SI-${m.msgId.slice(-8)}` };
  }
  const url = process.env.BAG_JOURNEY_URL, token = process.env.BAG_JOURNEY_TOKEN;
  if (!url || !token) return { ok: false, err: "LIVE_NOT_CONFIGURED", retry: false };
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/events", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": m.msgId },
      body: JSON.stringify(m), signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true, ref: String(((await r.json().catch(() => ({}))) as { id?: string }).id ?? m.msgId) };
    return { ok: false, err: `HTTP_${r.status}`, retry: r.status >= 500 || r.status === 429 };
  } catch (e) { return { ok: false, err: e instanceof Error ? e.message.slice(0, 80) : "SEND_FAILED", retry: true }; }
}

const due = (e: CustodyEvent, max: number, now: number) =>
  !!e.bj && (e.bj.status === "pending" || e.bj.status === "failed") && e.bj.tries < max && (!e.bj.next || Date.parse(e.bj.next) <= now);

/** Send every due custody entry of every POC booking. */
export async function bagJourneyPass(sb: SupabaseClient): Promise<{ sent: number; failed: number; waiting: number }> {
  const cfg = await loadPocConfig(sb);
  const out = { sent: 0, failed: 0, waiting: 0 };
  const { data } = await sb.from("bookings").select("doc").eq("doc->admin->airport->>enrolled", "true").limit(300);
  const now = Date.now();
  for (const row of data ?? []) {
    const b = row.doc as Booking;
    const queue = (opsOf(b).custody ?? []).filter((e) => due(e, cfg.bagJourney.maxTries, now));
    if (!queue.length) continue;
    const results = new Map<string, CustodyEvent["bj"]>();
    for (const e of queue) {
      const r = await send(sb, cfg, outboundOf(b, e, cfg));
      const at = new Date().toISOString();
      if (r.ok) { out.sent++; results.set(e.id, { status: "sent", tries: e.bj!.tries + 1, at, ref: r.ref }); continue; }
      if (!r.retry && r.err === "LIVE_NOT_CONFIGURED") { out.waiting++; results.set(e.id, { ...e.bj!, err: r.err, next: new Date(now + 15 * 60_000).toISOString() }); continue; }
      out.failed++;
      const tries = e.bj!.tries + 1;
      results.set(e.id, { status: "failed", tries: r.retry ? tries : cfg.bagJourney.maxTries, at, err: r.err, next: new Date(now + bjBackoffMs(tries)).toISOString() });
    }
    await mutateBooking(sb, b.id, (fresh) => {
      const o = opsOf(fresh);
      return { ...fresh, admin: { ...fresh.admin, ops: { ...o, custody: (o.custody ?? []).map((e) => (results.has(e.id) ? { ...e, bj: results.get(e.id) } : e)) } } };
    });
  }
  return out;
}

/* ================= inbound ================= */
export function webhookSecret(): string {
  const v = process.env.SITA_WEBHOOK_SECRET;
  if (v && v.length >= 16) return v;
  if (process.env.VERCEL) throw new Error("SITA_WEBHOOK_SECRET is missing or shorter than 16 characters.");
  return v || "dev-sita-webhook-secret";
}
export const signBody = (raw: string) => `sha256=${createHmac("sha256", webhookSecret()).update(raw).digest("hex")}`;
export function signatureOk(raw: string, header: string | null): boolean {
  const want = Buffer.from(signBody(raw)), got = Buffer.from(header ?? "");
  return want.length === got.length && timingSafeEqual(want, got);
}

export type Inbound =
  | { kind: "tag_printed"; eventId: string; lp: string; pnr: string; surname: string; airline: string; flightNo: string; weightKg?: number; photoUrl?: string; device?: string; at?: string }
  | { kind: "airline_event"; eventId: string; lp: string; code: string; text?: string; place?: string; at?: string }
  | { kind: "exception"; eventId: string; lp?: string; pnr?: string; type: string; note?: string; at?: string }
  | { kind: "device_status"; eventId: string; device: string; state: string; note?: string; at?: string };
export type InboundResult = { ok: true; duplicate?: boolean; booking?: string; orphan?: boolean } | { ok: false; error: string; detail: string };

const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const bad = (detail: string): InboundResult => ({ ok: false, error: "BAD_EVENT", detail });

async function bookingByLp(sb: SupabaseClient, lp: string): Promise<Booking | null> {
  const { data } = await sb.from("bookings").select("doc").filter("doc->admin->airport->airlineTags", "cs", JSON.stringify([{ lp }])).limit(1);
  return (data?.[0]?.doc as Booking | undefined) ?? null;
}
async function bookingByPnr(sb: SupabaseClient, pnr: string, surname: string): Promise<Booking | null> {
  const { data } = await sb.from("bookings").select("doc").eq("doc->admin->airport->flight->>pnr", pnr).limit(5);
  return ((data ?? []).map((r) => r.doc as Booking).find((b) => (airportOf(b).flight?.surname ?? "").replace(/\s/g, "") === surname.replace(/\s/g, "")) ?? null);
}

/** Link a Flexbox print to a booking: the first piece without an active tag. */
export async function applyTagPrinted(sb: SupabaseClient, id: string, ev: { lp: string; weightKg?: number; photoUrl?: string; device?: string; at: string }): Promise<{ ok: true } | { ok: false; error: string; detail: string }> {
  const cfg = await loadPocConfig(sb);
  const why: { e?: { error: string; detail: string } } = {};
  const next = await mutateBooking(sb, id, (b) => {
    why.e = undefined;
    const st = airportOf(b), f = st.flight;
    const pieces = b.bags + b.oversize;
    const n = Array.from({ length: pieces }, (_, i) => i + 1).find((k) => !activeTags(st).some((t) => t.n === k));
    if (!n) { why.e = { error: "ALL_TAGGED", detail: "Every piece already has an airline tag." }; return null; }
    const r = linkTag(st, { n, raw: ev.lp, carrier: f ? carrierOf(cfg, f.airline) : null, pieces, by: `Flexbox ${ev.device ?? ""}`.trim(), source: "flexbox", at: ev.at, weightKg: ev.weightKg, photo: ev.photoUrl, device: ev.device });
    if ("error" in r) { why.e = r; return null; }
    const withTag: Booking = { ...b, admin: { ...b.admin, airport: r as AirportState } };
    return withCustody(withTag, [custodyEvent({ at: ev.at, code: "TAG_LINK", pieces: [n], place: `Flexbox ${ev.device ?? ""}`.trim(), by: "SITA Print&Go", tags: [ev.lp], ...(ev.photoUrl ? { photo: ev.photoUrl } : {}), note: ev.weightKg ? `${ev.weightKg} kg at the Flexbox` : undefined }, true)]);
  });
  if (why.e) return { ok: false, ...why.e };
  return next ? { ok: true } : { ok: false, error: "NOT_SAVED", detail: "Booking not found or changed at the same moment." };
}

export async function handleInbound(sb: SupabaseClient, raw: unknown): Promise<InboundResult> {
  const p = (raw ?? {}) as Record<string, unknown>;
  const eventId = s(p.eventId, 64), kind = s(p.kind, 20);
  if (!/^[A-Za-z0-9:_.-]{4,64}$/.test(eventId)) return bad("eventId is required (4–64 letters, digits, : _ . -).");
  if (!["tag_printed", "airline_event", "exception", "device_status"].includes(kind)) return bad(`Unknown kind "${kind}".`);
  const at = Number.isFinite(Date.parse(s(p.at, 40))) ? new Date(s(p.at, 40)).toISOString() : new Date().toISOString();
  const lp = s(p.lp, 14).replace(/\s/g, "");
  if ((kind === "tag_printed" || kind === "airline_event") && !/^\d{10}$/.test(lp)) return bad("lp must be a 10-digit licence plate.");

  /* once per event id */
  const seen = await sb.from("settings").insert({ id: `bjin:${eventId}`, doc: { kind, at, receivedAt: new Date().toISOString() }, status: "bjin", created: new Date().toISOString() });
  if (seen.error) return /duplicate|unique/i.test(seen.error.message) ? { ok: true, duplicate: true } : { ok: false, error: "STORE_FAILED", detail: seen.error.message };
  const undo = () => sb.from("settings").delete().eq("id", `bjin:${eventId}`).then(() => undefined, () => undefined);

  if (kind === "device_status") {
    const device = s(p.device, 30);
    if (!device) { await undo(); return bad("device is required."); }
    await sb.from("settings").upsert({ id: `sitadev:${device}`, doc: { device, state: s(p.state, 30) || "unknown", note: s(p.note, 120), at }, status: "sitadevice", created: at });
    return { ok: true };
  }
  if (kind === "tag_printed") {
    const pnr = s(p.pnr, 6).toUpperCase(), surname = s(p.surname, 30).toUpperCase();
    const b = await bookingByPnr(sb, pnr, surname);
    const w = Number(p.weightKg);
    const ev = { lp, at, weightKg: Number.isFinite(w) && w > 0 && w < 100 ? Math.round(w * 10) / 10 : undefined, photoUrl: s(p.photoUrl, 300) || undefined, device: s(p.device, 30) || undefined };
    if (!b) {
      await sb.from("settings").upsert({ id: `bjorphan:${eventId}`, doc: { eventId, ...ev, pnr, surname, airline: s(p.airline, 2).toUpperCase(), flightNo: s(p.flightNo, 5) }, status: "bjorphan", created: at });
      return { ok: true, orphan: true };
    }
    const r = await applyTagPrinted(sb, b.id, ev);
    if (!r.ok) { await undo(); return r; }
    return { ok: true, booking: b.id };
  }
  if (kind === "airline_event") {
    const b = await bookingByLp(sb, lp);
    if (!b) { await undo(); return { ok: false, error: "UNKNOWN_TAG", detail: "No Bagdrop booking carries that tag." }; }
    await mutateBooking(sb, b.id, (fresh) => {
      const st = airportOf(fresh);
      if ((st.airlineEvents ?? []).some((e) => e.id === eventId)) return null;
      const ev = { id: eventId, lp, code: s(p.code, 20).toUpperCase() || "EVENT", text: s(p.text, 120), at, ...(s(p.place, 60) ? { place: s(p.place, 60) } : {}) };
      return { ...fresh, admin: { ...fresh.admin, airport: { ...st, airlineEvents: [...(st.airlineEvents ?? []), ev] } } };
    });
    return { ok: true, booking: b.id };
  }
  /* exception */
  const type = s(p.type, 20);
  const b = lp ? await bookingByLp(sb, lp) : s(p.pnr, 6) ? (await sb.from("bookings").select("doc").eq("doc->admin->airport->flight->>pnr", s(p.pnr, 6).toUpperCase()).limit(1)).data?.[0]?.doc as Booking | undefined ?? null : null;
  if (!b) { await undo(); return { ok: false, error: "UNKNOWN_BOOKING", detail: "No booking matches that tag or PNR." }; }
  const kindKey = isExceptionKind(type) ? type : "dcs_reject";
  await mutateBooking(sb, b.id, (fresh) => {
    const st = airportOf(fresh);
    if ((st.exceptions ?? []).some((e) => e.id === eventId)) return null;
    const n = lp ? activeTags(st).find((t) => t.lp === lp)?.n : undefined;
    const exc = { id: eventId, kind: kindKey, at, by: "SITA", note: `${s(p.note, 160) || "Reported by SITA"}${isExceptionKind(type) ? "" : ` (SITA type ${type || "unknown"})`}`, ...(n ? { n } : {}) };
    const withExc: Booking = { ...fresh, admin: { ...fresh.admin, airport: { ...st, exceptions: [...(st.exceptions ?? []), exc] } } };
    return withCustody(withExc, [custodyEvent({ at, code: "EXCEPTION", pieces: n ? [n] : [], place: "SITA", by: "SITA", note: exc.note }, false)]);
  });
  return { ok: true, booking: b.id };
}
