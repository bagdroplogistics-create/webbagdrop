/** Wedding desk operations shared by BAGDROP OS and the event company login
 *  (/event): rooms per guest or per bag, the rooming-list upload, scanned
 *  return acceptance, guest ↔ team messages, and tag reprint tracking.
 *  Pure functions over a booking doc; the routes save them with CAS
 *  (mutateBooking) so two people on the same family never overwrite each other. */
import type { Booking, WeddingMessage, WeddingReturn } from "./types";
import { RETURN_DONE, statusForStage } from "./weddingStatus";
import { WEDDING_STAGES } from "./types";
import { weddingTags } from "./weddingTagData";

type Member = { id: string; name?: string; phone?: string; room?: string };
type Bag = { id: string; owner?: string; room?: string; ret?: boolean; type?: string; colour?: string };
type State = { family?: { familyName?: string; lead?: string; phone?: string }; members?: Member[]; bags?: Bag[] };

export class OpsError extends Error {
  constructor(public code: string, public detail = "") { super(code); this.name = "OpsError"; }
}

export const deskStateOf = (b: Booking) => (b.wedding?.state ?? {}) as State;
const roomOf = (raw: unknown) => String(raw ?? "").trim().slice(0, 20);
const familyOf = (b: Booking) => deskStateOf(b).family?.familyName || b.family?.name || b.traveller.name;
const withState = (b: Booking, st: State, at: string, text: string, by: string): Booking => ({
  ...b,
  wedding: { ...b.wedding!, state: st, updatedAt: at },
  events: [...b.events, { at, by: "admin", text: `${text} (${by})` }],
});

/** A tag id is `<booking id>-<guest id>-<bag id>`; the booking id itself has hyphens. */
export function bookingIdOfTag(raw: string): string {
  const parts = raw.trim().toUpperCase().split("-");
  return parts.length >= 4 ? parts.slice(0, -2).join("-") : "";
}

export function setMemberRoom(b: Booking, memberId: string, room: string, by: string, at: string): Booking {
  const st = deskStateOf(b);
  const m = (st.members ?? []).find((x) => x.id === memberId);
  if (!m) throw new OpsError("NO_GUEST", "That guest is not on this booking.");
  const r = roomOf(room);
  if ((m.room ?? "") === r) return b;
  const members = (st.members ?? []).map((x) => (x.id === memberId ? { ...x, room: r, roomFromList: !!r } : x));
  return withState(b, { ...st, members }, at, r ? `Room ${r} set for ${m.name || memberId}` : `Room cleared for ${m.name || memberId}`, by);
}

/** A room on one bag overrides its owner's room (a bag going to someone else's room). */
export function setBagRoom(b: Booking, bagId: string, room: string, by: string, at: string): Booking {
  const st = deskStateOf(b);
  const bag = (st.bags ?? []).find((x) => x.id === bagId);
  if (!bag) throw new OpsError("NO_BAG", "That bag is not on this booking.");
  const r = roomOf(room);
  if ((bag.room ?? "") === r) return b;
  const bags = (st.bags ?? []).map((x) => (x.id === bagId ? { ...x, room: r || undefined } : x));
  const tag = `${b.wedding!.bookingId}-${bag.owner}-${bag.id}`;
  return withState(b, { ...st, bags }, at, r ? `Bag ${tag} goes to room ${r}` : `Bag ${tag} follows its owner's room again`, by);
}

/** Scan-and-accept a return bag at the hotel. Only bags booked for the trip home. */
export function acceptReturn(b: Booking, rawTag: string, condition: "ok" | "damaged", note: string, by: string, at: string): Booking {
  const tag = rawTag.trim().toUpperCase();
  const t = weddingTags(b).find((x) => x.tag.toUpperCase() === tag);
  if (!t) throw new OpsError("UNKNOWN_TAG", "No bag with this tag on the booking.");
  const bag = (deskStateOf(b).bags ?? []).find((x) => `${b.wedding!.bookingId}-${x.owner}-${x.id}`.toUpperCase() === tag);
  if (!bag?.ret) throw new OpsError("NOT_BOOKED_FOR_RETURN", "This bag was booked one way. Bookings are closed, so it cannot be added for the trip home.");
  const prev = b.wedding!.returns?.[t.tag];
  if (prev || RETURN_DONE.includes(b.wedding!.bagStatus?.[t.tag] ?? "")) throw new OpsError("ALREADY_ACCEPTED", prev ? `Accepted ${prev.at} by ${prev.by}.` : "Already accepted.");
  const rec: WeddingReturn = { at, by, condition, ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}) };
  return {
    ...b,
    status: statusForStage(WEDDING_STAGES.indexOf("Return pickup"), b.status),
    wedding: { ...b.wedding!, bagStatus: { ...b.wedding!.bagStatus, [t.tag]: "Return pickup" }, returns: { ...b.wedding!.returns, [t.tag]: rec }, updatedAt: at },
    events: [...b.events, { at, by: "admin", text: `Return bag ACCEPTED · ${t.tag} · ${t.guest} · condition ${condition === "ok" ? "OK" : "DAMAGED"}${rec.note ? ` · ${rec.note}` : ""} (${by})` }],
  };
}

export const MAX_MESSAGES = 60;
export function addMessage(b: Booking, msg: WeddingMessage): Booking {
  const list = b.wedding!.messages ?? [];
  if (list.length >= MAX_MESSAGES) throw new OpsError("TOO_MANY_MESSAGES", "This conversation is full. Please call or WhatsApp Bagdrop.");
  const text = msg.text.trim().slice(0, 1000);
  if (!text) throw new OpsError("EMPTY_MESSAGE");
  return { ...b, wedding: { ...b.wedding!, messages: [...list, { ...msg, text }], updatedAt: msg.at } };
}

/** Record what each printed tag said, so a later room change flags it for reprint. */
export function markPrinted(b: Booking, at: string, only?: Set<string>): Booking {
  const printed = { ...b.wedding!.printed };
  for (const t of weddingTags(b)) if (!only || only.has(t.tag)) printed[t.tag] = { at, deliver: t.deliver };
  return { ...b, wedding: { ...b.wedding!, printed } };
}

/* ---------------- rooming list ---------------- */
export interface RoomingRow { name: string; mobile?: string; room: string }
export interface RoomingMatch { id: string; memberId: string; guest: string; family: string; room: string; was: string; by: "mobile" | "name" }
const normName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const last10 = (s?: string) => String(s ?? "").replace(/\D/g, "").slice(-10);

/** Match a hotel rooming list to guests: mobile first, then a unique exact name. */
export function matchRooming(bookings: Booking[], rows: RoomingRow[]) {
  const guests = bookings.flatMap((b) => (deskStateOf(b).members ?? []).map((m) => ({ b, m, lead: last10(b.traveller.mobile), own: last10(m.phone), name: normName(m.name ?? "") })));
  const apply: RoomingMatch[] = [], unmatched: { row: RoomingRow; reason: string }[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const room = roomOf(row.room), name = normName(row.name ?? ""), mob = last10(row.mobile);
    if (!room) { unmatched.push({ row, reason: "no room number" }); continue; }
    let hits = mob.length === 10 ? guests.filter((g) => g.own === mob) : [];
    let by: "mobile" | "name" = "mobile";
    if (!hits.length && mob.length === 10) {
      // the family lead's mobile: pick the guest with that name in the family, or the only guest
      const fam = guests.filter((g) => g.lead === mob);
      hits = fam.filter((g) => g.name && g.name === name);
      if (!hits.length && fam.length === 1) hits = fam;
    }
    if (!hits.length && name) { hits = guests.filter((g) => g.name === name); by = "name"; }
    if (hits.length !== 1) { unmatched.push({ row, reason: hits.length ? `${hits.length} guests match this name; add the mobile` : "no guest found" }); continue; }
    const g = hits[0], key = `${g.b.id}|${g.m.id}`;
    if (taken.has(key)) { unmatched.push({ row, reason: "this guest already has a room from an earlier row" }); continue; }
    taken.add(key);
    apply.push({ id: g.b.id, memberId: g.m.id, guest: g.m.name ?? g.m.id, family: familyOf(g.b), room, was: g.m.room ?? "", by });
  }
  return { apply, unmatched };
}

/** Parse a CSV rooming list: a header row naming name / mobile / room columns (any order). */
export function parseRoomingCsv(text: string): RoomingRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out.map((x) => x.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  const iName = col("name", "guest"), iMob = col("mobile", "phone", "contact"), iRoom = col("room");
  if (iRoom < 0 || (iName < 0 && iMob < 0)) throw new OpsError("BAD_CSV", "The first row must name the columns: Name, Mobile and Room.");
  return lines.slice(1).slice(0, 2000).map(split).map((c) => ({ name: iName >= 0 ? c[iName] ?? "" : "", mobile: iMob >= 0 ? c[iMob] ?? "" : "", room: c[iRoom] ?? "" }));
}
