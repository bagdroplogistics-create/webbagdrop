/** The event manifest — everything the team needs to plan every pickup,
 *  delivery and return for a wedding or event, from the families' saved
 *  bookings (wedding.state, written by the Y2K desk): who, where, when,
 *  which bags with their tag codes, and what is still missing. The plan
 *  itself (run, order, planned time, captain, vehicle) is saved on the
 *  booking under wedding.plan, so the OS, the on-site manifest and the
 *  planner desk all read the same thing. Pure: no fetches here. */
import type { Booking } from "./types";

/* ---------- what the desk saves (loosely typed: older bookings vary) ---------- */
interface St {
  family?: { lead?: string; phone?: string; email?: string; side?: string; familyName?: string };
  members?: { id: string; name?: string; phone?: string; room?: string; ownAddr?: boolean }[];
  pickups?: { id: string; city?: string; address?: string; pincode?: string; landmark?: string; lift?: string; date?: string; slot?: string; members?: string[] }[];
  bags?: { id: string; type?: string; owner?: string; pickup?: string; colour?: string; weight?: string; value?: string; ret?: boolean; retDate?: string; retSlot?: string; retDest?: string; retAddress?: string; deliverTo?: string; room?: string; hang?: boolean }[];
  ret?: { date?: string; slot?: string; dest?: string; address?: string };
  decl?: boolean;
}
/** One leg's plan for one family (or one of its pickup addresses). */
export interface LegPlan { run?: string; order?: number; time?: string; captain?: string; vehicle?: string; note?: string }
export interface WeddingPlan { pickup?: Record<string, LegPlan>; delivery?: LegPlan; return?: LegPlan }
export const planOf = (b: Booking): WeddingPlan => ((b.wedding as { plan?: WeddingPlan } | undefined)?.plan ?? {});

export interface BagRow {
  tag: string; bagId: string; owner: string; ownerName: string; ownerPhone: string; room: string;
  type: string; colour: string; weight: string; value: string; hang: boolean;
  pickupId: string; returning: boolean; retDate: string; retSlot: string; retDest: string; stage: string;
}
export interface PickupRow {
  key: string;                 // `${bookingId}:${pickupId}`
  bookingId: string; status: string; family: string; side: string; lead: string; phone: string; email: string;
  guests: string[];            // names on this pickup
  city: string; address: string; pincode: string; landmark: string; lift: string; date: string; slot: string;
  bags: BagRow[]; plan: LegPlan; gaps: string[];
}
export interface DeliveryRow { bookingId: string; family: string; side: string; lead: string; phone: string; guests: { name: string; room: string; bags: BagRow[] }[]; bags: BagRow[]; plan: LegPlan; gaps: string[] }
export interface ReturnRow { bookingId: string; family: string; lead: string; phone: string; date: string; slot: string; dest: string; address: string; bags: BagRow[]; plan: LegPlan; gaps: string[] }
export interface Manifest {
  pickups: PickupRow[]; deliveries: DeliveryRow[]; returns: ReturnRow[]; bags: (BagRow & { bookingId: string; family: string; phone: string })[];
  gaps: { bookingId: string; family: string; items: string[] }[];
  totals: { families: number; guests: number; bags: number; returning: number; pickups: number };
}

const S = (v: unknown) => (v == null ? "" : String(v)).trim();
const BAG_TYPE: Record<string, string> = { small: "Small bag", large: "Large bag", cabin: "Cabin bag", checkin: "Check-in bag", xl: "Oversize", duffel: "Duffel", suit: "Suit bag" };
export const bagType = (t: string) => BAG_TYPE[t] ?? (t ? t[0].toUpperCase() + t.slice(1) : "");

/** Every family of the event, read into the rows the planner needs. */
export function buildManifest(bookings: Booking[], eventCode: string): Manifest {
  const fams = bookings.filter((b) => b.eventCode === eventCode && b.wedding?.state && !["cancelled", "rejected"].includes(b.status));
  const pickups: PickupRow[] = [], deliveries: DeliveryRow[] = [], returns: ReturnRow[] = [], allBags: Manifest["bags"] = [], gaps: Manifest["gaps"] = [];
  let guestsN = 0, returning = 0;
  for (const b of fams) {
    const st = (b.wedding!.state ?? {}) as St;
    const plan = planOf(b);
    const famName = S(st.family?.familyName) || b.family?.name || `${S(st.family?.lead) || b.traveller.name} family`;
    const lead = S(st.family?.lead) || b.traveller.name, phone = S(st.family?.phone) || b.traveller.mobile, email = S(st.family?.email) || b.traveller.email || "";
    const side = S(st.family?.side) || b.family?.side || "";
    const members = st.members ?? [];
    const member = (id: string) => members.find((m) => m.id === id);
    const bagStatus = b.wedding!.bagStatus ?? {};
    const rows: BagRow[] = (st.bags ?? []).map((bag) => {
      const m = member(S(bag.owner));
      const tag = `${b.wedding!.bookingId || b.id}-${S(bag.owner)}-${bag.id}`;
      return {
        tag, bagId: bag.id, owner: S(bag.owner), ownerName: S(m?.name) || (S(bag.owner) === "G01" ? lead : S(bag.owner)), ownerPhone: S(m?.phone) || (S(bag.owner) === "G01" ? phone : ""), room: S(bag.room) || S(m?.room),
        type: bagType(S(bag.type)), colour: S(bag.colour), weight: S(bag.weight), value: S(bag.value), hang: !!bag.hang,
        pickupId: S(bag.pickup) || (st.pickups?.[0]?.id ?? "P1"), returning: !!bag.ret, retDate: S(bag.retDate) || S(st.ret?.date), retSlot: S(bag.retSlot) || S(st.ret?.slot), retDest: S(bag.retDest) || S(st.ret?.dest), stage: bagStatus[tag] || "Booked",
      };
    });
    guestsN += members.length; returning += rows.filter((r) => r.returning).length;
    rows.forEach((r) => allBags.push({ ...r, bookingId: b.id, family: famName, phone }));
    const famGaps: string[] = [];
    if (!phone) famGaps.push("mobile");
    if (!members.length) famGaps.push("guests");
    if (!rows.length) famGaps.push("bags");
    rows.forEach((r) => { if (!r.type) famGaps.push(`bag ${r.bagId}: type`); });
    const pks = st.pickups?.length ? st.pickups : [{ id: "P1", city: b.from, address: b.pickAddr, date: b.date, slot: b.slot }];
    for (const p of pks) {
      const pbags = rows.filter((r) => r.pickupId === p.id);
      if (!pbags.length && pks.length > 1) continue;
      const names = (p.members?.length ? p.members : members.map((m) => m.id)).map((id) => S(member(id)?.name) || id);
      const g: string[] = [];
      if (!S(p.address)) g.push("pickup address"); if (!S(p.pincode)) g.push("pincode"); if (!S(p.date)) g.push("pickup date"); if (!S(p.slot)) g.push("pickup slot"); if (!S(p.lift)) g.push("lift or stairs");
      const pl = plan.pickup?.[p.id] ?? {};
      if (!pl.captain) g.push("captain"); if (!pl.time) g.push("planned time");
      pickups.push({ key: `${b.id}:${p.id}`, bookingId: b.id, status: b.status, family: famName, side, lead, phone, email, guests: names,
        city: S(p.city) || b.from, address: S(p.address), pincode: S(p.pincode), landmark: S(p.landmark), lift: S(p.lift), date: S(p.date) || b.date, slot: S(p.slot) || b.slot, bags: pbags, plan: pl, gaps: g });
      g.filter((x) => !["captain", "planned time"].includes(x)).forEach((x) => famGaps.push(`${pks.length > 1 ? p.id + ": " : ""}${x}`));
    }
    const dgaps: string[] = [];
    const guests = members.map((m) => ({ name: S(m.name) || m.id, room: S(m.room), bags: rows.filter((r) => r.owner === m.id) }));
    guests.forEach((gst) => { if (!gst.room) dgaps.push(`${gst.name}: room`); });
    const dpl = plan.delivery ?? {};
    if (!dpl.captain) dgaps.push("delivery captain"); if (!dpl.time) dgaps.push("planned time");
    deliveries.push({ bookingId: b.id, family: famName, side, lead, phone, guests, bags: rows, plan: dpl, gaps: dgaps });
    guests.forEach((gst) => { if (!gst.room) famGaps.push(`${gst.name}: room`); });
    const rbags = rows.filter((r) => r.returning);
    if (rbags.length) {
      const rg: string[] = [];
      const date = S(st.ret?.date) || rbags[0].retDate, slot = S(st.ret?.slot) || rbags[0].retSlot, dest = S(st.ret?.dest) || rbags[0].retDest;
      const address = dest === "other" ? S(st.ret?.address) || S((st.bags ?? []).find((x) => x.ret && x.retAddress)?.retAddress) : (pks[0] ? `${S(pks[0].address)}${S(pks[0].pincode) ? ", " + S(pks[0].pincode) : ""}` : b.pickAddr);
      if (!date) rg.push("return date"); if (!address) rg.push("return address");
      const rpl = plan.return ?? {};
      if (!rpl.captain) rg.push("captain"); if (!rpl.time) rg.push("planned time");
      returns.push({ bookingId: b.id, family: famName, lead, phone, date, slot, dest: dest === "other" ? "Other address" : "Same as pickup", address, bags: rbags, plan: rpl, gaps: rg });
      rg.filter((x) => !["captain", "planned time"].includes(x)).forEach((x) => famGaps.push(x));
    }
    if (famGaps.length) gaps.push({ bookingId: b.id, family: famName, items: [...new Set(famGaps)] });
  }
  const dayKey = (d: string) => d.replace(/\D/g, "").padStart(2, "0");
  pickups.sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)) || a.slot.localeCompare(b.slot) || a.pincode.localeCompare(b.pincode) || (a.plan.order ?? 999) - (b.plan.order ?? 999));
  returns.sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)) || a.slot.localeCompare(b.slot) || (a.plan.order ?? 999) - (b.plan.order ?? 999));
  deliveries.sort((a, b) => (a.plan.order ?? 999) - (b.plan.order ?? 999) || a.family.localeCompare(b.family));
  return { pickups, deliveries, returns, bags: allBags, gaps, totals: { families: fams.length, guests: guestsN, bags: allBags.length, returning, pickups: pickups.length } };
}

/** Group pickup rows by date, then slot, then pincode area — the natural route order. */
export function groupPickups(rows: PickupRow[]): { date: string; slots: { slot: string; areas: { pincode: string; rows: PickupRow[] }[] }[] }[] {
  const out: ReturnType<typeof groupPickups> = [];
  for (const r of rows) {
    let d = out.find((x) => x.date === r.date); if (!d) { d = { date: r.date, slots: [] }; out.push(d); }
    let s = d.slots.find((x) => x.slot === r.slot); if (!s) { s = { slot: r.slot, areas: [] }; d.slots.push(s); }
    const pin = r.pincode ? r.pincode.slice(0, 4) + "xx" : "no pincode";
    let a = s.areas.find((x) => x.pincode === pin); if (!a) { a = { pincode: pin, rows: [] }; s.areas.push(a); }
    a.rows.push(r);
  }
  return out;
}

/** CSV for a spreadsheet or a vendor: one line per bag, with the family's plan. */
export function manifestCsv(m: Manifest): string {
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Booking", "Family", "Side", "Lead", "Mobile", "Email", "Guest", "Guest mobile", "Room", "Pickup city", "Pickup address", "Pincode", "Landmark", "Lift", "Pickup date", "Pickup slot", "Pickup run", "Order", "Planned time", "Captain", "Vehicle", "Tag code", "Bag", "Type", "Colour", "Weight", "Declared value", "Hang", "Stage", "Returning", "Return date", "Return slot", "Return to", "Delivery captain", "Delivery time"];
  const lines = [head.join(",")];
  for (const p of m.pickups) {
    const d = m.deliveries.find((x) => x.bookingId === p.bookingId);
    for (const b of p.bags) {
      lines.push([p.bookingId, p.family, p.side, p.lead, p.phone, p.email, b.ownerName, b.ownerPhone, b.room, p.city, p.address, p.pincode, p.landmark, p.lift, p.date, p.slot, p.plan.run ?? "", p.plan.order ?? "", p.plan.time ?? "", p.plan.captain ?? "", p.plan.vehicle ?? "",
        b.tag, b.bagId, b.type, b.colour, b.weight, b.value, b.hang ? "yes" : "", b.stage, b.returning ? "yes" : "", b.retDate, b.retSlot, b.retDest === "other" ? "other address" : b.returning ? "same as pickup" : "", d?.plan.captain ?? "", d?.plan.time ?? ""].map(esc).join(","));
    }
  }
  return lines.join("\n");
}
