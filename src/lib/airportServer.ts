/** Server-only: the Airport desk's actions on a POC booking (T2 lanes A–D).
 *  Every change is compare-and-swap (mutateBooking) and writes its own
 *  custody entry, so the ledger and the airport state never disagree.
 *  Gates, in the order the bag meets them:
 *   tag link  → the flight's carrier, the airline's numeric code, one active
 *               tag per piece, a tag number used by no other booking
 *   hold out  → only an open hold
 *   T2 scan   → picked up · out of hold · (departures) every piece airline-tagged
 *   handover  → every piece scanned at T2 · the guest's boarding pass matches
 *               the flight, PNR and surname (or a written override) · lane D
 *               only once BCAS approval is ticked in the config */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { bagForScan, spaced } from "./bagTags";
import { opsOf } from "./opsModel";
import {
  AIRPORT_EXCEPTIONS, CUSTODY, LANES, activeTags, airportOf, boardingPassMismatches, carrierOf, cleanConfig, cleanFlight, flightLabel, flightOf,
  isExceptionKind, istShort, linkTag, openHold, parseBcbp, parseLicencePlate, planWindow, slotMs, spacedLp, untaggedPieces, voidTag,
  type AirportPocConfig, type AirportState, type FlightBlock, type Lane,
} from "./airportPoc";
import { T2_SKIPPED, allPieces, bjOn, custodyEvent, custodyGaps, withCustody, type CustodyEvent } from "./custody";
import type { Booking } from "./types";

export const POC_ROW = "airport-poc";

export async function loadPocConfig(sb: SupabaseClient): Promise<AirportPocConfig> {
  const { data } = await sb.from("settings").select("doc").eq("id", POC_ROW).maybeSingle();
  return cleanConfig(data?.doc ?? {});
}
export async function savePocConfig(sb: SupabaseClient, raw: unknown, by: string): Promise<AirportPocConfig> {
  const cfg = { ...cleanConfig(raw), updatedAt: new Date().toISOString(), updatedBy: by };
  const { error } = await sb.from("settings").upsert({ id: POC_ROW, doc: cfg, status: "config", created: cfg.updatedAt });
  if (error) throw new Error(error.message);
  return cfg;
}

export type DeskResult = { ok: true; booking: Booking; note?: string } | { ok: false; error: string; detail: string; status?: number };
type Step = { next: Booking; note?: string } | { error: string; detail: string };

async function change(sb: SupabaseClient, id: string, fn: (b: Booking, st: AirportState) => Step): Promise<DeskResult> {
  const out: { refusal?: { error: string; detail: string }; note?: string } = {};
  const next = await mutateBooking(sb, id, (b) => {
    out.refusal = undefined;
    const r = fn(b, airportOf(b));
    if ("error" in r) { out.refusal = r; return null; }
    out.note = r.note;
    return r.next;
  });
  if (out.refusal) return { ok: false, ...out.refusal, status: 409 };
  if (!next) return { ok: false, error: "NOT_SAVED", detail: "Booking not found, or it changed at the same moment — try again.", status: 409 };
  return { ok: true, booking: next, note: out.note };
}
const put = (b: Booking, st: AirportState, events: CustodyEvent[], text?: string): Booking => {
  const nb: Booking = { ...b, admin: { ...b.admin, airport: st }, events: text ? [...b.events, { at: new Date().toISOString(), by: "admin" as const, text }] : b.events };
  return withCustody(nb, events);
};
const pieces = (b: Booking) => b.bags + b.oversize;
const isDep = (st: AirportState) => st.lane === "A" || st.lane === "D";
const CLOSED: Booking["status"][] = ["cancelled", "rejected"];

/* ---------------- enrol & flight ---------------- */
export function enrol(sb: SupabaseClient, id: string, lane: Lane, by: string) {
  return change(sb, id, (b, st) => {
    if (!(lane in LANES)) return { error: "BAD_LANE", detail: "Lane must be A, B, C or D." };
    if (CLOSED.includes(b.status)) return { error: "CLOSED", detail: `${b.id} is ${b.status}.` };
    if (st.t2?.handover) return { error: "DONE", detail: "Already handed over at T2." };
    if (lane !== "C" && b.mode !== "air") return { error: "NOT_AIR", detail: "Lanes A, B and D are for air bookings — use lane C for other moves." };
    const now = new Date().toISOString();
    const first = !st.enrolled;
    const next: AirportState = { ...st, lane, enrolled: true, enrolledAt: st.enrolledAt ?? now };
    /* earlier custody entries join the Bag Journey queue on first enrolment */
    const o = opsOf(b);
    const custody = first ? (o.custody ?? []).map((e) => (e.bj?.status === "off" ? { ...e, bj: { status: "pending" as const, tries: 0 } } : e)) : o.custody;
    const nb: Booking = { ...b, admin: { ...b.admin, airport: next, ops: { ...o, ...(custody ? { custody } : {}) } }, events: [...b.events, { at: now, by: "admin", text: `T2 POC · lane ${lane} (${LANES[lane]}) · by ${by}` }] };
    return { next: nb };
  });
}

export function setFlight(sb: SupabaseClient, id: string, raw: Partial<FlightBlock>, by: string) {
  return change(sb, id, (b, st) => {
    if (!st.enrolled) return { error: "NOT_ENROLLED", detail: "Enrol the booking in the T2 POC first." };
    const f = cleanFlight({ ...raw, dir: st.lane === "B" ? "arr" : "dep" });
    const prev = st.flight;
    const changed = prev && (prev.airline !== f.airline || prev.flightNo !== f.flightNo || prev.std !== f.std);
    const live = activeTags(st);
    if (changed && live.length) return { error: "VOID_TAGS_FIRST", detail: `${live.length} airline tag(s) belong to ${flightLabel(prev)} — void them (flight change) before moving the booking to ${flightLabel(f)}.` };
    return { next: put(b, { ...st, flight: f }, [], `T2 POC flight ${flightLabel(f)} ${f.std.replace("T", " ")} IST${f.pnr ? ` · PNR ${f.pnr}` : ""} · by ${by}`) };
  });
}

/* ---------------- airline tags ---------------- */
/** Another booking already using this licence plate (any status). */
export async function lpUsedElsewhere(sb: SupabaseClient, lp: string, id: string): Promise<string | null> {
  const { data } = await sb.from("bookings").select("id").filter("doc->admin->airport->airlineTags", "cs", JSON.stringify([{ lp }])).neq("id", id).limit(1);
  return data?.[0]?.id ?? null;
}

export async function linkAirlineTag(sb: SupabaseClient, id: string, a: { n: number; scan: string; place?: string; weightKg?: number }, by: string): Promise<DeskResult> {
  const p = parseLicencePlate(a.scan);
  if (p) {
    const other = await lpUsedElsewhere(sb, p.lp, id);
    if (other) return { ok: false, error: "TAG_ON_OTHER_BOOKING", detail: `Tag ${spacedLp(p.lp)} already belongs to ${other}.`, status: 409 };
  }
  const cfg = await loadPocConfig(sb);
  return change(sb, id, (b, st) => {
    if (!st.enrolled) return { error: "NOT_ENROLLED", detail: "Enrol the booking in the T2 POC first." };
    if (st.lane === "C") return { error: "LANE_C", detail: "Lane C moves use Bagdrop's own tags, not airline tags." };
    if (st.t2?.handover) return { error: "DONE", detail: "Already handed over." };
    const f = st.flight;
    const c = f ? carrierOf(cfg, f.airline) : null;
    const w = Number(a.weightKg);
    const weightKg = Number.isFinite(w) && w > 0 ? Math.round(w * 10) / 10 : undefined;
    if (weightKg && c && weightKg > c.maxBagKg) return { error: "OVERWEIGHT", detail: `${weightKg} kg is over ${c.name}'s ${c.maxBagKg} kg per bag — log an "Overweight" exception and tell the guest.` };
    const now = new Date().toISOString();
    const r = linkTag(st, { n: Number(a.n), raw: a.scan, carrier: c, pieces: pieces(b), by, source: "scan", at: now, weightKg });
    if ("error" in r) return r;
    const lp = parseLicencePlate(a.scan)!.lp;
    const ev = custodyEvent({ at: now, code: "TAG_LINK", pieces: [Number(a.n)], place: (a.place ?? "").trim().slice(0, 60) || "Airport desk", by, tags: [lp], ...(weightKg ? { note: `${weightKg} kg` } : {}) }, true);
    return { next: put(b, r, [ev], `Airline tag ${spacedLp(lp)} linked to piece ${a.n}${weightKg ? ` · ${weightKg} kg` : ""} · by ${by}`) };
  });
}

export function voidAirlineTag(sb: SupabaseClient, id: string, lp: string, reason: string, by: string) {
  return change(sb, id, (b, st) => {
    if (st.t2?.handover) return { error: "DONE", detail: "Already handed over." };
    const now = new Date().toISOString();
    const tag = activeTags(st).find((t) => t.lp === lp);
    const r = voidTag(st, lp, reason, by, now);
    if ("error" in r) return r;
    return { next: put(b, r, [custodyEvent({ at: now, code: "TAG_VOID", pieces: tag ? [tag.n] : [], place: "Airport desk", by, tags: [lp], note: reason.trim().slice(0, 120) }, true)], `Airline tag ${spacedLp(lp)} voided (${reason.trim()}) · by ${by}`) };
  });
}

/* ---------------- secure hold ---------------- */
export async function holdIn(sb: SupabaseClient, id: string, spotId: string, by: string): Promise<DeskResult> {
  const cfg = await loadPocConfig(sb);
  const spot = cfg.holdSpots.find((h) => h.id === spotId);
  if (!spot) return { ok: false, error: "NO_SPOT", detail: "Pick a hold spot from the config.", status: 400 };
  return change(sb, id, (b, st) => {
    if (!st.enrolled) return { error: "NOT_ENROLLED", detail: "Enrol the booking in the T2 POC first." };
    if (!opsOf(b).milestones?.picked) return { error: "NOT_PICKED", detail: "The bags aren't picked up yet." };
    if (openHold(st)) return { error: "ALREADY_HELD", detail: `Already in hold at ${openHold(st)!.spot}.` };
    if (st.t2?.arrivedAt) return { error: "AT_T2", detail: "Already at T2." };
    const now = new Date().toISOString(), all = allPieces(b);
    return { next: put(b, { ...st, holds: [...(st.holds ?? []), { spot: spot.name, camera: spot.camera, pieces: all, inAt: now, inBy: by }] },
      [custodyEvent({ at: now, code: "HOLD_IN", pieces: all, place: spot.name, by, seals: (opsOf(b).bags ?? []).flatMap((x) => (x.seal ? [x.seal] : [])), note: `CCTV ${spot.camera}` }, bjOn(b))],
      `Into secure hold ${spot.name} (CCTV ${spot.camera}) · by ${by}`) };
  });
}
export function holdOut(sb: SupabaseClient, id: string, by: string) {
  return change(sb, id, (b, st) => {
    const h = openHold(st);
    if (!h) return { error: "NOT_HELD", detail: "Nothing is in hold for this booking." };
    const now = new Date().toISOString();
    return { next: put(b, { ...st, holds: (st.holds ?? []).map((x) => (x === h ? { ...x, outAt: now, outBy: by } : x)) },
      [custodyEvent({ at: now, code: "HOLD_OUT", pieces: h.pieces, place: h.spot, by, note: `CCTV ${h.camera}` }, bjOn(b))],
      `Out of secure hold ${h.spot} · by ${by}`) };
  });
}

/* ---------------- T2 ---------------- */
/** Which piece a T2 scan means: an airline licence plate, or our own tag. */
function pieceForScan(b: Booking, st: AirportState, raw: string): number | null {
  const p = parseLicencePlate(raw);
  if (p) return activeTags(st).find((t) => t.lp === p.lp)?.n ?? null;
  return bagForScan(opsOf(b).bags ?? [], raw)?.n ?? null;
}

export function t2Scan(sb: SupabaseClient, id: string, scan: string, by: string) {
  return change(sb, id, (b, st) => {
    if (!st.enrolled || st.lane === "B" || st.lane === "C") return { error: "NOT_T2_DEPARTURE", detail: "T2 scans are for departure lanes A and D." };
    if (!opsOf(b).milestones?.picked) return { error: "NOT_PICKED", detail: "The bags aren't picked up yet." };
    if (openHold(st)) return { error: "STILL_IN_HOLD", detail: `Scan the bags out of hold (${openHold(st)!.spot}) first.` };
    if (st.t2?.handover) return { error: "DONE", detail: "Already handed over." };
    const missing = untaggedPieces(st, pieces(b));
    if (isDep(st) && missing.length) return { error: "UNTAGGED", detail: `Piece(s) ${missing.join(", ")} have no airline tag — they can't go to T2.` };
    const n = pieceForScan(b, st, scan);
    if (!n) return { error: "TAG_UNKNOWN", detail: "That tag doesn't belong to this booking — stop and check the bag." };
    const scanned = [...new Set([...(st.t2?.scanned ?? []), n])].sort((x, z) => x - z);
    const done = scanned.length === pieces(b) && !st.t2?.arrivedAt;
    const now = new Date().toISOString();
    const t2 = { ...st.t2, scanned, ...(done ? { arrivedAt: now } : {}) };
    const events = done ? [custodyEvent({ at: now, code: "ARRIVE_T2", pieces: scanned, place: "Mumbai T2", by, tags: activeTags(st).map((t) => t.lp), seals: (opsOf(b).bags ?? []).flatMap((x) => (x.seal ? [x.seal] : [])) }, bjOn(b))] : [];
    return { next: put(b, { ...st, t2 }, events, done ? `All ${scanned.length} piece(s) scanned at T2 · by ${by}` : undefined), note: `${scanned.length}/${pieces(b)} scanned` };
  });
}

/** Mark the move done when Bagdrop's custody ends at T2: any milestone the T2 lane skips is filled with a note saying so. */
function closeAtT2(b: Booking, by: string, receiver: string, now: string): Booking {
  const o = opsOf(b);
  const ms = { ...o.milestones };
  for (const k of ["inscan", "depart", "arrive", "ofd"] as const) if (!ms[k]) ms[k] = { at: now, by, note: T2_SKIPPED };
  ms.pod = { at: now, by, note: "custody ended at T2" };
  return { ...b, status: "delivered", pod: { no: `POD-${b.id}`, at: now, receiver }, admin: { ...b.admin, ops: { ...o, milestones: ms } } };
}

export function handoverPax(sb: SupabaseClient, id: string, a: { boardingPass?: string; override?: string }, by: string, cfgP: Promise<AirportPocConfig>) {
  return cfgP.then((cfg) => change(sb, id, (b, st) => {
    if (st.lane !== "A") return { error: "NOT_LANE_A", detail: "Handback to the passenger is lane A." };
    if (st.t2?.handover) return { error: "DONE", detail: "Already handed over." };
    if (!st.t2?.arrivedAt) return { error: "NOT_ALL_SCANNED", detail: `Scan every piece at T2 first (${st.t2?.scanned?.length ?? 0}/${pieces(b)}).` };
    const f = st.flight;
    if (!f) return { error: "NO_FLIGHT", detail: "No flight on this booking." };
    let proof: string;
    const bp = a.boardingPass ? parseBcbp(a.boardingPass) : null;
    if (bp) {
      const mm = boardingPassMismatches(bp, f, cfg.airport);
      if (mm.length) return { error: "BOARDING_PASS_MISMATCH", detail: `Boarding pass doesn't match: ${mm.join("; ")}. Don't hand over.` };
      proof = `boarding pass ${bp.airline} ${bp.flightNo} seat ${bp.seat || "-"} · ${bp.surname}`;
    } else if (a.boardingPass) {
      return { error: "NOT_A_BOARDING_PASS", detail: "That code isn't an airline boarding pass — scan the guest's mobile boarding pass QR." };
    } else if ((a.override ?? "").trim().length >= 10) {
      proof = `override: ${a.override!.trim().slice(0, 160)}`;
    } else return { error: "NEED_BOARDING_PASS", detail: "Scan the guest's boarding pass, or write why it can't be scanned (10+ characters)." };
    const now = new Date().toISOString();
    const receiver = b.traveller.name;
    const ev = custodyEvent({ at: now, code: "HANDOVER_PAX", pieces: allPieces(b), place: "Mumbai T2 · departures", by, tags: activeTags(st).map((t) => t.lp), note: proof }, bjOn(b));
    const nb = closeAtT2(put(b, { ...st, t2: { ...st.t2, handover: { kind: "pax", at: now, by, receiver, proof } } }, [ev], `Handed back at T2 to ${receiver} · ${proof} · by ${by}`), by, receiver, now);
    return { next: nb };
  }));
}

export function handoverHandler(sb: SupabaseClient, id: string, a: { receiver: string; handlerId: string }, by: string, cfgP: Promise<AirportPocConfig>) {
  return cfgP.then((cfg) => change(sb, id, (b, st) => {
    if (st.lane !== "D") return { error: "NOT_LANE_D", detail: "Handover to the handler is lane D." };
    if (!cfg.bhsInjectionApproved) return { error: "BCAS_NOT_APPROVED", detail: "BHS injection is off until BCAS, MIAL, the airline and the handler approve it (Airport desk → Settings)." };
    if (st.t2?.handover) return { error: "DONE", detail: "Already handed over." };
    if (!st.t2?.arrivedAt) return { error: "NOT_ALL_SCANNED", detail: "Scan every piece at T2 first." };
    const receiver = (a.receiver ?? "").trim().slice(0, 60), hid = (a.handlerId ?? "").trim().slice(0, 30);
    if (receiver.length < 3 || hid.length < 3) return { error: "NEED_HANDLER", detail: "Enter the handler's name and staff or AEP number." };
    const now = new Date().toISOString();
    const proof = `handler ${receiver} (${hid})`;
    const ev = custodyEvent({ at: now, code: "HANDOVER_HANDLER", pieces: allPieces(b), place: "Mumbai T2 · BHS injection point", by, tags: activeTags(st).map((t) => t.lp), note: proof }, bjOn(b));
    return { next: closeAtT2(put(b, { ...st, t2: { ...st.t2, handover: { kind: "handler", at: now, by, receiver, proof } } }, [ev], `Handed to ${proof} at the T2 BHS point · by ${by}`), by, receiver, now) };
  }));
}

/* ---------------- exceptions ---------------- */
export function logException(sb: SupabaseClient, id: string, a: { kind: string; note: string; n?: number }, by: string) {
  return change(sb, id, (b, st) => {
    if (!st.enrolled) return { error: "NOT_ENROLLED", detail: "Enrol the booking in the T2 POC first." };
    if (!isExceptionKind(a.kind)) return { error: "BAD_KIND", detail: "Pick an exception type." };
    const note = (a.note ?? "").trim().slice(0, 200);
    if (note.length < 3) return { error: "NO_NOTE", detail: "Say what happened." };
    const n = Number(a.n) || undefined;
    if (n && (n < 1 || n > pieces(b))) return { error: "BAD_PIECE", detail: `Piece must be 1–${pieces(b)}.` };
    const now = new Date().toISOString();
    const exc = { id: `X${Date.now().toString(36)}`, kind: a.kind, at: now, by, note, ...(n ? { n } : {}) };
    return { next: put(b, { ...st, exceptions: [...(st.exceptions ?? []), exc] }, [custodyEvent({ at: now, code: "EXCEPTION", pieces: n ? [n] : [], place: "Airport desk", by, note: `${AIRPORT_EXCEPTIONS[a.kind].name}: ${note}` }, bjOn(b))],
      `T2 exception · ${AIRPORT_EXCEPTIONS[a.kind].name}${n ? ` · piece ${n}` : ""}: ${note} · by ${by}`) };
  });
}
export function resolveException(sb: SupabaseClient, id: string, excId: string, resolution: string, by: string) {
  return change(sb, id, (b, st) => {
    const e = (st.exceptions ?? []).find((x) => x.id === excId);
    if (!e) return { error: "NOT_FOUND", detail: "No such exception." };
    if (e.resolved) return { error: "ALREADY", detail: "Already resolved." };
    const r = (resolution ?? "").trim().slice(0, 200);
    if (r.length < 3) return { error: "NO_NOTE", detail: "Say how it was resolved (root cause and fix)." };
    const now = new Date().toISOString();
    return { next: put(b, { ...st, exceptions: (st.exceptions ?? []).map((x) => (x === e ? { ...x, resolved: true, resolvedAt: now, resolvedBy: by, resolution: r } : x)) }, [],
      `T2 exception resolved · ${AIRPORT_EXCEPTIONS[e.kind]?.name ?? e.kind}: ${r} · by ${by}`) };
  });
}

/** Failed Bag Journey sends back into the queue (after a fix on either side). */
export function retryBagJourney(sb: SupabaseClient, id: string) {
  return change(sb, id, (b) => {
    const o = opsOf(b);
    let n = 0;
    const custody = (o.custody ?? []).map((e) => (e.bj?.status === "failed" ? (n++, { ...e, bj: { status: "pending" as const, tries: 0 } }) : e));
    if (!n) return { error: "NOTHING_FAILED", detail: "No failed sends on this booking." };
    return { next: { ...b, admin: { ...b.admin, ops: { ...o, custody } } }, note: `${n} send(s) queued again` };
  });
}

/* ---------------- custody report (BCAS evidence pack) ---------------- */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export function custodyReportHtml(b: Booking, cfg: AirportPocConfig): string {
  const o = opsOf(b), st = airportOf(b), f = flightOf(b);
  const plan = f ? planWindow(f, carrierOf(cfg, f.airline), cfg, slotMs(b.pickupDate || b.date, b.slot)) : null;
  const gaps = custodyGaps(b);
  const plate = (n: number) => o.bags?.find((x) => x.n === n)?.plate;
  const rows = (o.custody ?? []).map((e) => `<tr><td>${esc(istShort(Date.parse(e.at)))}</td><td><b>${esc(CUSTODY[e.code])}</b><br><span class=m>${esc(e.code)}</span></td><td>${esc(e.pieces.join(", ") || "—")}</td><td>${esc(e.place)}</td><td>${esc(e.by)}</td><td class=m>${esc([...(e.tags ?? []).map(spacedLp), ...(e.seals ?? []).map(spaced)].join(" · ") || "—")}</td><td>${esc(e.note ?? "")}${e.photo ? " · photo on file" : ""}</td><td class=m>${esc(e.bj ? `${e.bj.status}${e.bj.ref ? ` ${e.bj.ref}` : ""}` : "")}</td></tr>`).join("");
  const bagRows = Array.from({ length: pieces(b) }, (_, i) => i + 1).map((n) => {
    const tags = (st.airlineTags ?? []).filter((t) => t.n === n);
    const bag = o.bags?.find((x) => x.n === n);
    return `<tr><td>${n}${bag?.xl ? " XL" : ""}</td><td class=m>${esc(plate(n) ? spaced(plate(n)!) : "—")}</td><td class=m>${esc(bag?.seal ? spaced(bag.seal) : "—")}</td><td class=m>${tags.map((t) => `${esc(spacedLp(t.lp))}${t.status === "void" ? ` (void: ${esc(t.voidReason)})` : ""}`).join("<br>") || "—"}</td><td>${esc(bag?.weightKg ?? tags.find((t) => t.weightKg)?.weightKg ?? "—")}</td><td>${bag?.photo ? "yes" : "—"}</td></tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset=utf-8><title>Custody report ${esc(b.id)}</title><style>
body{font:12px/1.45 Inter,Arial,sans-serif;color:#1f2937;margin:28px}h1{font-size:20px;margin:0}h2{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#1f2937;color:#fff;font-weight:600}.m{font-family:"IBM Plex Mono",monospace;font-size:11px}
.k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.k div{border:1px solid #e5e7eb;border-radius:8px;padding:8px}.k b{display:block;font-size:10px;color:#6b7280;text-transform:uppercase}.bad{color:#b91c1c}.ok{color:#15803d}
@media print{body{margin:12mm}}</style></head><body>
<p class=m>BAGDROP · CHAIN OF CUSTODY · CONFIDENTIAL</p><h1>${esc(b.id)} · ${esc(b.from)} → ${esc(b.to)}</h1>
<p>${esc(st.lane ? `Lane ${st.lane}: ${LANES[st.lane]}` : "Not in the T2 POC")} · ${pieces(b)} piece(s) · generated ${esc(istShort(Date.now()))} IST</p>
<div class=k><div><b>Flight</b>${esc(f ? `${flightLabel(f)} · ${f.std.replace("T", " ")}` : "—")}</div><div><b>PNR</b>${esc(f?.pnr ?? "—")}</div><div><b>Window</b>${esc(plan?.note ?? "—")}</div><div><b>Handover</b>${esc(st.t2?.handover ? `${st.t2.handover.kind === "pax" ? "Passenger" : "Handler"} · ${istShort(Date.parse(st.t2.handover.at))} · ${st.t2.handover.proof}` : "Open")}</div></div>
<h2>Gaps</h2><p class=${gaps.length ? "bad" : "ok"}>${gaps.length ? gaps.map(esc).join("<br>") : "None — every milestone has a custody entry covering every piece."}</p>
<h2>Bags</h2><table><tr><th>Piece</th><th>Bagdrop tag</th><th>Seal</th><th>Airline tag</th><th>kg</th><th>Photo</th></tr>${bagRows}</table>
<h2>Custody ledger (${(o.custody ?? []).length} entries, append-only)</h2><table><tr><th>Time IST</th><th>Event</th><th>Pieces</th><th>Place</th><th>By</th><th>Tags · seals</th><th>Note</th><th>Bag Journey</th></tr>${rows || "<tr><td colspan=8>No entries yet.</td></tr>"}</table>
${(st.exceptions ?? []).length ? `<h2>Exceptions</h2><table><tr><th>Time</th><th>Type</th><th>Note</th><th>Resolution</th></tr>${(st.exceptions ?? []).map((e) => `<tr><td>${esc(istShort(Date.parse(e.at)))}</td><td>${esc(AIRPORT_EXCEPTIONS[e.kind]?.name ?? e.kind)}</td><td>${esc(e.note)}</td><td>${esc(e.resolved ? `${e.resolution} (${e.resolvedBy})` : "OPEN")}</td></tr>`).join("")}</table>` : ""}
${(st.airlineEvents ?? []).length ? `<h2>Airline and airport events (via Bag Journey)</h2><table><tr><th>Time</th><th>Tag</th><th>Code</th><th>Text</th></tr>${(st.airlineEvents ?? []).map((e) => `<tr><td>${esc(istShort(Date.parse(e.at)))}</td><td class=m>${esc(spacedLp(e.lp))}</td><td>${esc(e.code)}</td><td>${esc(e.text)}${e.place ? ` · ${esc(e.place)}` : ""}</td></tr>`).join("")}</table>` : ""}
</body></html>`;
}
