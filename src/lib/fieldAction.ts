/** Server-only: the captain's bag actions (pickup check-in, delivery claim
 *  check), shared by the driver page (/api/track/driver/bags, one leg per
 *  link) and the Operations desk (/api/admin/ops/field, entries marked
 *  "entered by ops"). Same rules either way: src/lib/fieldOps.ts. */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { opsOf } from "./opsModel";
import { spaced } from "./bagTags";
import { issueTags } from "./tagIssue";
import { checkInBag, claimBag, claimPass, completeDelivery, completePickup, newDeliveryOtp, recordDelivery, savePhoto, savePodPhoto, type FieldResult } from "./fieldOps";
import { notify, kickSweep } from "./automation";
import type { Booking } from "./types";
import { activeTags, airportOf, spacedLp } from "./airportPoc";
import { linkAirlineTag } from "./airportServer";
import { AADHAAR_REQUIRED } from "./phase";
import type { LegKey } from "./opsModel";

export const reply = (r: FieldResult, extra: Record<string, unknown> = {}) =>
  r.ok ? NextResponse.json({ ok: true, ...extra, state: stateOf(r.booking) }) : NextResponse.json({ error: r.error, detail: r.detail }, { status: 409 });

export function stateOf(b: Booking) {
  const o = opsOf(b);
  const c = o.claim ?? {};
  return {
    pieces: b.bags + b.oversize, xl: b.oversize,
    identityOk: !AADHAAR_REQUIRED || !!b.identity?.ok, lrIssued: !!o.milestones?.lr, podPhoto: !!c.photo, picked: !!o.milestones?.picked,
    arrived: !!o.milestones?.arrive, delivered: !!o.milestones?.pod,
    bags: (o.bags ?? []).map((x) => ({
      n: x.n, plate: spaced(x.plate), xl: x.xl, seal: x.seal ? spaced(x.seal) : null,
      weightKg: x.weightKg ?? null, photo: !!x.photo, checkedIn: !!x.checkedInAt,
      claimed: (c.scanned ?? []).includes(x.plate),
    })),
    claim: { passScanned: !!c.passAt, otpSentAt: c.otpAt ?? null },
    /* T2 POC departures: the airline tag the guest printed at the Flexbox goes with each piece */
    airline: (() => {
      const st = airportOf(b);
      if (!st.enrolled || (st.lane !== "A" && st.lane !== "D")) return null;
      return { flight: st.flight ? `${st.flight.airline} ${st.flight.flightNo}` : null, tags: activeTags(st).map((t) => ({ n: t.n, lp: spacedLp(t.lp) })) };
    })(),
  };
}


export type FieldBody = { action?: string; n?: number; tag?: string; lp?: string; seal?: string; weightKg?: number; heavyOk?: boolean; signature?: string; scan?: string; otp?: string; receiver?: string; relation?: string; at?: string; note?: string; captain?: string; vehicle?: string };

/** One JSON action on a booking's leg. `entry` marks who entered it. */
export async function fieldAction(sb: SupabaseClient, b: Booking, leg: LegKey, captain: string, body: FieldBody, entry: "ops" | "captain") {
  const pickupActions = ["issue", "checkin", "complete", "airlineTag"], deliveryActions = ["pass", "bag", "otp", "deliver", "deliverDesk"];
  if (body.action === "deliverDesk" && entry !== "ops") return NextResponse.json({ error: "DESK_ONLY" }, { status: 403 });
  if (pickupActions.includes(body.action ?? "") && leg !== "pickup") return NextResponse.json({ error: "PICKUP_ONLY" }, { status: 403 });
  if (deliveryActions.includes(body.action ?? "") && leg !== "lastmile") return NextResponse.json({ error: "DELIVERY_ONLY" }, { status: 403 });
  switch (body.action) {
    case "issue": {
      const r = await issueTags(sb, b.id, `captain ${captain}`);
      if ("error" in r) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
      return NextResponse.json({ ok: true, issued: r.issued, state: stateOf(r.booking) });
    }
    case "checkin": return reply(await checkInBag(sb, b.id, captain, { n: Number(body.n), tag: body.tag ?? "", seal: body.seal ?? "", weightKg: Number(body.weightKg), heavyOk: !!body.heavyOk }));
    case "airlineTag": {
      if (!airportOf(b).enrolled) return NextResponse.json({ error: "NOT_POC", detail: "This booking isn't in the T2 POC." }, { status: 409 });
      const r = await linkAirlineTag(sb, b.id, { n: Number(body.n), scan: body.lp ?? "", place: `Pickup · ${b.from}` }, `captain ${captain}`);
      return r.ok ? NextResponse.json({ ok: true, state: stateOf(r.booking) }) : NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status ?? 409 });
    }
    case "complete": { const r = await completePickup(sb, b.id, captain, body.signature ?? "", entry, { captain: body.captain, vehicle: body.vehicle, at: body.at, note: body.note }); if (r.ok) kickSweep(); return reply(r); }
    case "pass": return reply(await claimPass(sb, b.id, body.scan ?? ""));
    case "bag": return reply(await claimBag(sb, b.id, body.scan ?? ""));
    case "otp": {
      const r = await newDeliveryOtp(sb, b.id);
      if (!r.ok || !r.otp) return reply(r);
      const sent = await notify("delivery_otp", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email },
        { ref: b.id, otp: r.otp, captain }, `otp:${b.id}:${Date.now()}`).catch(() => 0);
      kickSweep();
      return reply(r, { sent: sent > 0 });
    }
    case "deliverDesk": { const r = await recordDelivery(sb, b.id, captain, { receiver: body.receiver ?? "", relation: body.relation ?? "", at: body.at, note: body.note, captain: body.captain }); if (r.ok) kickSweep(); return reply(r); }
    case "deliver": { const r = await completeDelivery(sb, b.id, captain, { otp: body.otp ?? "", receiver: body.receiver ?? "", relation: body.relation ?? "", signature: body.signature ?? "" }, entry); if (r.ok) kickSweep(); return reply(r); }
    default: return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  }
}

/** Multipart photo: a bag photo at pickup (n = piece) or the delivery photo (kind = pod). */
export async function fieldPhoto(sb: SupabaseClient, b: Booking, leg: LegKey, form: FormData) {
  const file = form.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "NO_PHOTO" }, { status: 400 });
  if (form.get("kind") === "pod") {
    if (leg !== "lastmile") return NextResponse.json({ error: "DELIVERY_ONLY" }, { status: 403 });
    return reply(await savePodPhoto(sb, b.id, file));
  }
  if (leg !== "pickup") return NextResponse.json({ error: "PICKUP_ONLY" }, { status: 403 });
  return reply(await savePhoto(sb, b.id, Number(form.get("n")), file));
}
