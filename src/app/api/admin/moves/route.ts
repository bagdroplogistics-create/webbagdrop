import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { mutateBooking } from "@/lib/bookingStore";
import { notify, kickSweep } from "@/lib/automation";
import { normFleet, slotMinutes, type FleetSettings } from "@/lib/movesPlan";
import type { Booking } from "@/lib/types";
import { istToday } from "@/lib/services";

/** BAGDROP OS · Moves calendar — the writes behind the calendar.
 *   GET                       fleet settings (vehicle capacities, run window…)
 *   saveFleet {fleet}         update them
 *   reschedule {id, leg, date, slot?, reason}
 *                             move a pickup or delivery; a reason is required,
 *                             the booking event log records it and the
 *                             customer is told on WhatsApp + email
 *   carrier {id, no}          flight / train no. for air & rail clubbing
 *   planRun {ids, leg}        mark city pickups / deliveries as one run
 *   clearRun {ids, leg}       undo that
 *  Every booking write is compare-and-swap (mutateBooking). */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEG_NAME = { pickup: "pickup", delivery: "delivery" } as const;
type Leg = keyof typeof LEG_NAME;
const MOVABLE: Booking["status"][] = ["quoted", "identified", "submitted", "revised", "accepted", "assigned", "picked_up", "in_transit"];
const pretty = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

async function readFleet(sb: NonNullable<ReturnType<typeof serviceClient>>): Promise<FleetSettings> {
  const { data } = await sb.from("settings").select("doc").eq("id", "fleet").maybeSingle();
  return normFleet((data?.doc as { fleet?: Partial<FleetSettings> } | undefined)?.fleet);
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ fleet: await readFleet(sb) });
}

type Body =
  | { action: "saveFleet"; fleet: Partial<FleetSettings> }
  | { action: "reschedule"; id: string; leg: Leg; date: string; slot?: string; reason: string }
  | { action: "carrier"; id: string; no: string }
  | { action: "planRun" | "clearRun"; ids: string[]; leg: Leg };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const now = new Date().toISOString();
  const ev = (text: string) => ({ at: now, by: "admin" as const, text });

  if (b.action === "saveFleet") {
    const fleet = normFleet(b.fleet);
    const { error } = await sb.from("settings").upsert({ id: "fleet", doc: { fleet }, status: null, created: now });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, fleet });
  }

  if (b.action === "reschedule") {
    const reason = (b.reason ?? "").trim().slice(0, 300);
    const slot = (b.slot ?? "").trim().slice(0, 40);
    if (!LEG_NAME[b.leg] || !b.id) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    if (!DATE.test(b.date ?? "")) return NextResponse.json({ error: "BAD_DATE", detail: "Pick a valid date." }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: "NEEDS_REASON", detail: "Give the reason the customer will see." }, { status: 400 });
    if (slot && slotMinutes(slot) === null) return NextResponse.json({ error: "BAD_SLOT" }, { status: 400 });
    if (b.date < istToday()) return NextResponse.json({ error: "IN_PAST", detail: "A move can't be rescheduled into the past." }, { status: 409 });

    const out: { refusal?: { error: string; detail: string } } = {};
    let was = "";
    const next = await mutateBooking(sb, b.id, (fresh) => {
      out.refusal = undefined;
      if (!MOVABLE.includes(fresh.status)) { out.refusal = { error: "NOT_MOVABLE", detail: `${fresh.id} is ${fresh.status} — it can't be rescheduled.` }; return null; }
      const pickup = (fresh.pickupDate || fresh.date).slice(0, 10);
      if (b.leg === "pickup") {
        if (["picked_up", "in_transit"].includes(fresh.status)) { out.refusal = { error: "ALREADY_PICKED", detail: `${fresh.id} has already been picked up.` }; return null; }
        if (fresh.lr) { out.refusal = { error: "ON_TRIP", detail: `${fresh.id} already has LR ${fresh.lr.no} on trip ${fresh.lr.trip}. Remove it from the trip in LR & trips first.` }; return null; }
        if (fresh.deliveryDate && b.date > fresh.deliveryDate) { out.refusal = { error: "AFTER_DELIVERY", detail: `The pickup can't be after the delivery date (${fresh.deliveryDate}). Move the delivery first.` }; return null; }
        was = `${pretty(pickup)}${fresh.slot ? `, ${fresh.slot}` : ""}`;
        return {
          ...fresh, pickupDate: b.date, slot: slot || fresh.slot,
          admin: { ...fresh.admin, runs: { ...((fresh.admin as { runs?: object }).runs ?? {}), pickup: undefined } },
          events: [...fresh.events, ev(`Pickup moved ${was} → ${pretty(b.date)}${slot || fresh.slot ? `, ${slot || fresh.slot}` : ""} · ${reason}`)],
        };
      }
      if (b.date < pickup) { out.refusal = { error: "BEFORE_PICKUP", detail: `The delivery can't be before the pickup (${pickup}).` }; return null; }
      was = fresh.deliveryDate ? pretty(fresh.deliveryDate) : "not set";
      return {
        ...fresh, deliveryDate: b.date,
        admin: { ...fresh.admin, runs: { ...((fresh.admin as { runs?: object }).runs ?? {}), delivery: undefined } },
        events: [...fresh.events, ev(`Delivery moved ${was} → ${pretty(b.date)} · ${reason}`)],
      };
    });
    if (out.refusal) return NextResponse.json(out.refusal, { status: 409 });
    if (!next) return NextResponse.json({ error: "NOT_SAVED", detail: "The booking changed or couldn't be found — reload and try again." }, { status: 409 });

    const origin = (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
    const when = `${pretty(b.date)}${b.leg === "pickup" && next.slot ? `, ${next.slot}` : ""}`;
    const sent = await notify("booking_rescheduled", { name: next.traveller.name, mobile: next.traveller.mobile, email: next.traveller.email }, {
      ref: next.id, lane: `${next.from} → ${next.to}`, leg: LEG_NAME[b.leg], when, was, note: reason, dashboard: `${origin}/account`,
    }, `resched:${next.id}:${b.leg}:${b.date}:${next.slot}:${now}`).catch(() => 0);
    kickSweep();
    return NextResponse.json({ ok: true, booking: next, notified: sent });
  }

  if (b.action === "carrier") {
    const no = (b.no ?? "").trim().toUpperCase().replace(/\s+/g, " ").slice(0, 20);
    if (no && !/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(no)) return NextResponse.json({ error: "BAD_NUMBER", detail: "Use the flight or train number, e.g. 6E 5123 or 12951." }, { status: 400 });
    const next = await mutateBooking(sb, b.id, (fresh) => {
      if (!["air", "rail"].includes(fresh.mode)) return null;
      return {
        ...fresh,
        admin: { ...fresh.admin, carrier: no ? { no, at: now } : undefined },
        events: [...fresh.events, ev(no ? `${fresh.mode === "air" ? "Flight" : "Train"} ${no} set for the line-haul` : "Flight / train no. cleared")],
      };
    });
    if (!next) return NextResponse.json({ error: "NOT_SAVED", detail: "Only air and rail bookings carry a flight / train no." }, { status: 409 });
    return NextResponse.json({ ok: true, booking: next });
  }

  if (b.action === "planRun" || b.action === "clearRun") {
    const ids = [...new Set((b.ids ?? []).filter(Boolean))].slice(0, 60);
    if (!LEG_NAME[b.leg] || ids.length < (b.action === "planRun" ? 2 : 1)) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const run = b.action === "planRun" ? newToken("RUN", 6) : undefined;
    const saved: string[] = [];
    for (const id of ids) {
      const next = await mutateBooking(sb, id, (fresh) => ({
        ...fresh,
        admin: { ...fresh.admin, runs: { ...((fresh.admin as { runs?: object }).runs ?? {}), [b.leg]: run } },
        events: [...fresh.events, ev(run ? `${LEG_NAME[b.leg]} planned as one run ${run} with ${ids.length - 1} other booking(s)` : `${LEG_NAME[b.leg]} run cleared`)],
      }));
      if (next) saved.push(id);
    }
    return NextResponse.json({ ok: saved.length === ids.length, run: run ?? null, saved });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
