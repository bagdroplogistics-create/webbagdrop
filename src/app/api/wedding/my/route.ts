import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { clientFromCookie, ownsBooking } from "@/lib/clientAuth";
import { qr } from "@/lib/barcodes";
import { bookingOpen, closesText, weddingStatus } from "@/lib/weddingStatus";
import { WEDDING_STAGES, type BagdropEvent, type Booking } from "@/lib/types";
import { weddingTags } from "@/lib/weddingTagData";
import { mutateBooking } from "@/lib/bookingStore";
import { OpsError, addMessage } from "@/lib/weddingOps";
import { alertTeamOfGuestMessage } from "@/lib/weddingOpsHandler";

/** The wedding guest dashboard (/e/[code]/my). The guest signs in with an
 *  OTP to their mobile (the same client session /account uses); this returns
 *  every family booking on that event made with that mobile — status, each
 *  bag's tag code + a scannable QR and its stage, pickups and rooms. Never
 *  admin, payment or identity fields. */

const BAG_TYPE: Record<string, string> = {
  large: "Large suitcase", medium: "Medium suitcase", cabin: "Cabin bag", garment: "Garment bag",
  trunk: "Trunk / duffel", gift: "Gift / hamper box", decor: "Décor crate",
};
type DeskState = {
  family?: { familyName?: string; lead?: string; side?: string };
  members?: { id: string; name?: string; room?: string }[];
  pickups?: { id?: string; label?: string; city?: string; date?: string; slot?: string }[];
  bags?: { id: string; owner?: string; type?: string; colour?: string; ret?: boolean; retDate?: string }[];
};

export async function GET(req: Request) {
  const who = clientFromCookie(req.headers.get("cookie"));
  if (!who) return NextResponse.json({ error: "SIGNED_OUT" }, { status: 401 });
  const event = (new URL(req.url).searchParams.get("event") ?? "").slice(0, 40);
  if (!event) return NextResponse.json({ error: "MISSING_EVENT" }, { status: 400 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data: evRow } = await sb.from("events").select("doc,status").eq("id", event).maybeSingle();
  const ev = evRow?.doc as BagdropEvent | undefined;
  const booking = { open: !!ev && (evRow?.status ?? ev.status) === "open" && bookingOpen(ev), closes: closesText(ev) };
  const { data, error } = await sb.from("bookings").select("doc").eq("doc->>eventCode", event).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookings = (data ?? [])
    .map((r) => r.doc as Booking)
    .filter((b) => b.wedding && ownsBooking(who, b))
    .sort((a, b) => b.created.localeCompare(a.created))
    .map((b) => {
      const st = (b.wedding!.state ?? {}) as DeskState;
      const bagStatus = b.wedding!.bagStatus ?? {};
      const members = st.members ?? [];
      const deliver = new Map(weddingTags(b).map((t) => [t.tag, t.deliver]));
      return {
        id: b.id,
        status: b.status,
        ...(({ label, tone, stage }) => ({ statusLabel: label, tone, stage }))(weddingStatus(b)),
        created: b.created,
        familyName: st.family?.familyName || b.family?.name || b.traveller.name,
        side: st.family?.side ?? b.family?.side ?? "",
        route: `${b.from} → ${b.to}`,
        pickups: (st.pickups ?? []).map((p) => ({ label: p.label ?? "", city: p.city ?? "", date: p.date ?? "", slot: p.slot ?? "" })),
        members: members.map((m) => ({ name: m.name ?? "", room: m.room ?? "" })),
        bags: (st.bags ?? []).map((bag) => {
          const tag = `${b.wedding!.bookingId}-${bag.owner}-${bag.id}`;
          const stages = bag.ret ? [...WEDDING_STAGES] : WEDDING_STAGES.slice(0, 6);
          return {
            tag, qr: qr(tag),
            owner: members.find((m) => m.id === bag.owner)?.name || bag.owner || "",
            type: BAG_TYPE[bag.type ?? ""] ?? "Bag", colour: bag.colour ?? "",
            stage: bagStatus[tag] ?? "Booked", stages, returning: !!bag.ret, deliver: deliver.get(tag) ?? "",
          };
        }),
        messages: (b.wedding!.messages ?? []).map((m) => ({ at: m.at, by: m.by, name: m.by === "guest" ? "You" : m.name, text: m.text, tag: m.tag ?? "" })),
      };
    });
  return NextResponse.json({ booking, who: who.kind === "m" ? `+91 ${who.value.slice(-10, -5)} ${who.value.slice(-5)}` : who.value, bookings });
}

/** A guest's message about their bags or any query → the event company and Bagdrop.
 *  POST {action:"message", event, id, text, tag?} — signed-in owner of the booking only. */
export async function POST(req: Request) {
  const who = clientFromCookie(req.headers.get("cookie"));
  if (!who) return NextResponse.json({ error: "SIGNED_OUT" }, { status: 401 });
  let body: { action?: string; event?: string; id?: string; text?: string; tag?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (body.action !== "message") return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const at = new Date().toISOString();
  let refused: unknown = null;
  const saved = await mutateBooking(sb, String(body.id ?? ""), (fresh) => {
    try {
      if (!fresh.wedding || fresh.eventCode !== body.event || !ownsBooking(who, fresh)) throw new OpsError("NOT_FOUND");
      const last = [...(fresh.wedding.messages ?? [])].reverse().find((m) => m.by === "guest");
      if (last && Date.parse(at) - Date.parse(last.at) < 10_000) throw new OpsError("TOO_FAST", "Please wait a few seconds before sending another message.");
      const tag = body.tag && weddingTags(fresh).some((t) => t.tag === body.tag) ? body.tag : undefined;
      return addMessage(fresh, { at, by: "guest", name: fresh.traveller.name, text, ...(tag ? { tag } : {}) });
    } catch (e) { refused = e; return null; }
  });
  if (refused instanceof OpsError) return NextResponse.json({ error: refused.code, detail: refused.detail }, { status: refused.code === "NOT_FOUND" ? 404 : 429 });
  if (!saved) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { data: evRow } = await sb.from("events").select("doc").eq("id", saved.eventCode ?? "").maybeSingle();
  await alertTeamOfGuestMessage(saved, evRow?.doc as BagdropEvent | undefined, text, saved.wedding?.messages?.at(-1)?.tag, at);
  return NextResponse.json({ ok: true });
}
