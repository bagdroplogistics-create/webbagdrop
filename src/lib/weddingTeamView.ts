/** What the event company and BAGDROP OS see of one wedding family booking:
 *  guests with rooms, every bag tag with where it goes, its stage, its return
 *  and reprint state, and the message thread. Pure, so the portal (server
 *  projection) and the Weddings module (browser, from the admin feed) agree. */
import type { Booking, WeddingMessage, WeddingReturn } from "./types";
import { weddingTags } from "./weddingTagData";
import { weddingStatus } from "./weddingStatus";

export interface TeamBag {
  tag: string; bagId: string; owner: string; guest: string; deliver: string; bag: string; n: number; of: number;
  flags: string[]; pickup: string; ret: string; returning: boolean; room: string;
  stage: string; returned: WeddingReturn | null; printed: boolean; reprint: boolean;
}
export interface TeamFamily {
  id: string; eventCode: string; status: string; statusLabel: string; tone: string; stage: string; created: string;
  family: string; side: string; lead: string; mobile: string;
  pickups: string[]; members: { id: string; name: string; room: string; leaves: string }[];
  bags: TeamBag[]; messages: WeddingMessage[]; unread: boolean;
}

type St = {
  family?: { familyName?: string; side?: string };
  members?: { id: string; name?: string; room?: string; depDate?: string }[];
  pickups?: { label?: string; city?: string; date?: string; slot?: string }[];
  bags?: { id: string; owner?: string; room?: string }[];
};

export function teamView(b: Booking): TeamFamily {
  const st = (b.wedding?.state ?? {}) as St;
  const ws = weddingStatus(b);
  const code = b.wedding?.bookingId ?? b.id;
  const messages = b.wedding?.messages ?? [];
  return {
    id: b.id, eventCode: b.eventCode ?? "", status: b.status, statusLabel: ws.label, tone: ws.tone, stage: ws.stage, created: b.created,
    family: st.family?.familyName || b.family?.name || b.traveller.name,
    side: st.family?.side === "groom" ? "Groom's side" : st.family?.side === "bride" ? "Bride's side" : "",
    lead: b.traveller.name, mobile: b.traveller.mobile,
    pickups: (st.pickups ?? []).map((p) => [p.label, p.city, p.date, p.slot].filter(Boolean).join(" · ")),
    members: (st.members ?? []).map((m) => ({ id: m.id, name: m.name || m.id, room: m.room ?? "", leaves: m.depDate ?? "" })),
    bags: weddingTags(b).map((t) => {
      const bag = (st.bags ?? []).find((x) => `${code}-${x.owner}-${x.id}` === t.tag);
      return {
        tag: t.tag, bagId: bag?.id ?? "", owner: bag?.owner ?? "", guest: t.guest, deliver: t.deliver, bag: t.bag, n: t.n, of: t.of, flags: t.flags,
        pickup: t.pickup, ret: t.ret, returning: t.returning, room: bag?.room ?? "",
        stage: b.wedding?.bagStatus?.[t.tag] ?? "Booked", returned: b.wedding?.returns?.[t.tag] ?? null,
        printed: t.printed, reprint: t.reprint,
      };
    }),
    messages, unread: messages.length > 0 && messages[messages.length - 1].by === "guest",
  };
}
