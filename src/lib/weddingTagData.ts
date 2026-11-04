/** Wedding bag tags as data — one per bag booked on a wedding desk. Pure
 *  (no barcode library), so BAGDROP OS and the event company portal use it in
 *  the browser; lib/weddingTags.ts turns it into printable labels. */
import type { Booking } from "./types";

export type DeskBag = { id: string; owner?: string; room?: string; pickup?: string; type?: string; colour?: string; weight?: string; deliverTo?: string; hang?: boolean; fragile?: boolean; ret?: boolean; retDate?: string; retSlot?: string };
type DeskState = {
  family?: { familyName?: string; lead?: string; side?: string };
  members?: { id: string; name?: string; room?: string }[];
  pickups?: { id: string; city?: string; date?: string; slot?: string }[];
  bags?: DeskBag[];
};
const BAG_TYPE: Record<string, string> = {
  small: "Small bag", large: "Large bag", medium: "Medium suitcase", cabin: "Cabin bag", garment: "Garment bag",
  trunk: "Trunk / duffel", gift: "Gift / hamper box", decor: "Décor crate",
};

export interface WeddingTag {
  tag: string; bookingId: string; family: string; side: string;
  guest: string; deliver: string; bag: string; n: number; of: number;
  flags: string[]; pickup: string; ret: string; returning: boolean;
  /** parts of pickup and return, for the airline-style tag */
  fromCity: string; pickupDate: string; pickupSlot: string; retDate: string; retSlot: string;
  /** printed before; reprint = what it says now differs from what was printed */
  printed: boolean; reprint: boolean;
}

/** Every bag of one wedding booking, as tags (the same tag ids the desk and dashboard show). */
export function weddingTags(b: Booking): WeddingTag[] {
  const st = (b.wedding?.state ?? {}) as DeskState;
  const bags = st.bags ?? [], members = st.members ?? [];
  const code = b.wedding?.bookingId ?? b.id;
  return bags.map((bag, i) => {
    const m = members.find((x) => x.id === bag.owner);
    const p = (st.pickups ?? []).find((x) => x.id === bag.pickup) ?? (st.pickups ?? [])[0];
    const deliver = bag.room ? `Room ${bag.room}` : bag.deliverTo === "host" ? "Host family suite" : bag.deliverTo === "decor" ? "Décor team"
      : bag.deliverTo === "room" && m?.room ? `Room ${m.room}` : "Bell desk";
    const flags = [bag.hang && "HANG", bag.fragile && "FRAGILE", bag.weight === "Over 32 kg" && "HEAVY"].filter(Boolean) as string[];
    const tag = `${code}-${bag.owner}-${bag.id}`, was = b.wedding?.printed?.[tag];
    return {
      tag, bookingId: code, printed: !!was, reprint: !!was && was.deliver !== deliver, returning: !!bag.ret,
      family: st.family?.familyName || b.family?.name || b.traveller.name,
      side: st.family?.side === "groom" ? "Groom's side" : st.family?.side === "bride" ? "Bride's side" : "",
      guest: m?.name || "Guest", deliver,
      bag: [bag.colour, BAG_TYPE[bag.type ?? ""] ?? "Bag"].filter(Boolean).join(" "),
      n: i + 1, of: bags.length, flags,
      pickup: p ? [p.date, p.slot, p.city].filter(Boolean).join(" · ") : "",
      fromCity: p?.city ?? "", pickupDate: p?.date ?? "", pickupSlot: p?.slot ?? "", retDate: bag.ret ? bag.retDate ?? "" : "", retSlot: bag.ret ? bag.retSlot ?? "" : "",
      ret: bag.ret ? `RETURN ${[bag.retDate, bag.retSlot].filter(Boolean).join(" · ")}` : "ONE WAY",
    };
  });
}
