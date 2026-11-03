/** One handler for the wedding desk actions, used by BAGDROP OS
 *  (/api/admin/wedding-ops, every event) and the event company portal
 *  (/api/event-team, only the events that list the signed-in mobile).
 *  Server-only. Every write goes through mutateBooking (CAS). */
import { NextResponse } from "next/server";
import { mutateBooking } from "./bookingStore";
import { notify, opsNotify } from "./automation";
import { OpsError, acceptReturn, addMessage, bookingIdOfTag, matchRooming, parseRoomingCsv, setBagRoom, setMemberRoom } from "./weddingOps";
import type { serviceClient } from "./supabaseAdmin";
import type { BagdropEvent, Booking } from "./types";

type SB = NonNullable<ReturnType<typeof serviceClient>>;
/** name = the company (or "BAGDROP OS"); person = who in the event company is signed in */
export type Actor = { kind: "event" | "bagdrop"; name: string; person?: string };
export type OpsBody = {
  action?: string; id?: string; event?: string; memberId?: string; bagId?: string; room?: string;
  tag?: string; condition?: string; note?: string; text?: string; csv?: string; apply?: boolean;
};

const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 404, ALREADY_ACCEPTED: 409, TOO_MANY_MESSAGES: 429 };
const fail = (e: unknown) => e instanceof OpsError
  ? NextResponse.json({ error: e.code, detail: e.detail }, { status: STATUS[e.code] ?? 400 })
  : NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });

/** Live wedding bookings of one event (declined and cancelled left out). */
export async function eventBookings(sb: SB, event: string): Promise<Booking[]> {
  const { data } = await sb.from("bookings").select("doc").eq("doc->>eventCode", event).limit(1000);
  return (data ?? []).map((r) => r.doc as Booking).filter((b) => b.wedding && !["rejected", "cancelled"].includes(b.status));
}

const guestPage = (ev: BagdropEvent | undefined) => `${ev?.page ?? `/e/${(ev?.id ?? "").toLowerCase()}`}/my`;

export async function weddingAction(sb: SB, actor: Actor, body: OpsBody, allowed: BagdropEvent[] | null): Promise<NextResponse> {
  const now = new Date().toISOString();
  const by = actor.kind === "event" ? `Event company · ${actor.name}${actor.person ? ` · ${actor.person}` : ""}` : actor.name;
  const signed = actor.kind === "event" && actor.person ? `${actor.person} (${actor.name})` : actor.name;
  const may = (b: Booking) => !!b.wedding && (allowed === null || allowed.some((e) => e.id === b.eventCode));
  const eventOf = async (code: string) => allowed?.find((e) => e.id === code)
    ?? ((await sb.from("events").select("doc").eq("id", code).maybeSingle()).data?.doc as BagdropEvent | undefined);

  /** CAS-save one booking; the change throws OpsError for a refusal */
  const change = async (id: string, fn: (b: Booking) => Booking) => {
    let refused: unknown = null;
    const saved = await mutateBooking(sb, id, (fresh) => {
      try { if (!may(fresh)) throw new OpsError("NOT_FOUND"); return fn(fresh); }
      catch (e) { refused = e; return null; }
    });
    if (refused) throw refused;
    if (!saved) throw new OpsError("NOT_FOUND");
    return saved;
  };

  try {
    switch (body.action) {
      case "setRoom": {
        await change(String(body.id), (b) => setMemberRoom(b, String(body.memberId), String(body.room ?? ""), by, now));
        return NextResponse.json({ ok: true });
      }
      case "setBagRoom": {
        await change(String(body.id), (b) => setBagRoom(b, String(body.bagId), String(body.room ?? ""), by, now));
        return NextResponse.json({ ok: true });
      }
      case "acceptReturn": {
        const tag = String(body.tag ?? "").trim().toUpperCase();
        const id = bookingIdOfTag(tag);
        if (!id) throw new OpsError("UNKNOWN_TAG", "That is not a wedding bag tag.");
        const condition = body.condition === "damaged" ? "damaged" : "ok";
        if (condition === "damaged" && !String(body.note ?? "").trim()) throw new OpsError("NOTE_REQUIRED", "Describe the damage before accepting.");
        const b = await change(id, (fresh) => acceptReturn(fresh, tag, condition, String(body.note ?? ""), by, now)).catch((e) => {
          throw e instanceof OpsError && e.code === "NOT_FOUND" ? new OpsError("UNKNOWN_TAG", "No booked bag has this tag.") : e;
        });
        return NextResponse.json({ ok: true, tag, returned: b.wedding?.returns?.[tag] ?? null });
      }
      case "reply": {
        const text = String(body.text ?? "").trim();
        const b = await change(String(body.id), (fresh) => addMessage(fresh, { at: now, by: actor.kind, name: signed, text }));
        const ev = await eventOf(b.eventCode ?? "");
        await notify("wedding_reply", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email }, {
          from: actor.kind === "event" ? signed : "Bagdrop", ref: b.id, text: text.slice(0, 600), link: guestPage(ev),
        }, `wmsg:${b.id}:${now}`);
        return NextResponse.json({ ok: true });
      }
      case "rooming": {
        const code = String(body.event ?? "");
        const ev = await eventOf(code);
        if (!ev || (allowed !== null && !allowed.some((e) => e.id === code))) throw new OpsError("NOT_FOUND");
        const rows = parseRoomingCsv(String(body.csv ?? "").slice(0, 400_000));
        if (!rows.length) throw new OpsError("BAD_CSV", "The file has no rows.");
        const result = matchRooming(await eventBookings(sb, code), rows);
        if (!body.apply) return NextResponse.json({ ok: true, preview: true, ...result });
        let applied = 0;
        const byBooking = new Map<string, typeof result.apply>();
        for (const m of result.apply) byBooking.set(m.id, [...(byBooking.get(m.id) ?? []), m]);
        for (const [id, list] of byBooking) {
          await change(id, (b) => list.reduce((acc, m) => setMemberRoom(acc, m.memberId, m.room, `${by} · rooming list`, now), b));
          applied += list.filter((m) => m.room !== m.was).length;
        }
        return NextResponse.json({ ok: true, applied, unmatched: result.unmatched });
      }
      default:
        return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}

/** A guest's message → the event company's mobiles and the Bagdrop ops alert. */
export async function alertTeamOfGuestMessage(b: Booking, ev: BagdropEvent | undefined, text: string, tag: string | undefined, at: string) {
  const family = b.family?.name ?? b.traveller.name;
  const d = { family, ref: b.id, text: text.slice(0, 600), tag: tag ?? "", portal: "/event" };
  const people = ev?.team?.people?.length ? ev.team.people : (ev?.team?.mobiles ?? []).map((mobile) => ({ name: ev?.team?.company ?? "Event team", mobile }));
  for (const p of people) {
    await notify("wedding_guest_message", { name: p.name, mobile: p.mobile }, d, `wgm:${b.id}:${at}:${p.mobile}`);
  }
  await opsNotify(`Guest message · ${family} (${b.id})${tag ? ` · bag ${tag}` : ""}: "${text.slice(0, 300)}"`, `Guest message · ${b.id}`, `ops:wgm:${b.id}:${at}`);
}
