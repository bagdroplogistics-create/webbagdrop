import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { mutateBooking } from "@/lib/bookingStore";
import { driverPath, readGps, trackPath, type GpsDoc } from "@/lib/trackLinks";
import { isTrackable, trackState, type TrackEta, type TrackLeg } from "@/lib/tracking";
import { opsOf } from "@/lib/opsModel";
import type { Booking } from "@/lib/types";

/** BAGDROP OS · Live tracking.
 *   GET   every move in progress: GPS trail (from the gps:<id> rows), the
 *         customer tracking link and each assigned leg's driver link. The
 *         stage / ETA / position maths runs in the browser off the booking
 *         list (src/lib/tracking.ts), so the map keeps moving between polls.
 *   POST  {action:"eta", id, at, note?}   ETA for the next step, typed by ops
 *         {action:"clearEta", id} */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").in("status", ["accepted", "assigned", "picked_up", "in_transit"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const live = (data ?? []).map((r) => r.doc as Booking).filter(isTrackable);
  const gps = await readGps(sb, live.map((b) => b.id));
  const moves: Record<string, { trackUrl: string; driverLinks: Partial<Record<TrackLeg, { url: string; assignee: string; mobile?: string }>>; gps: GpsDoc | null }> = {};
  for (const b of live) {
    const legs = opsOf(b).legs ?? {};
    const driverLinks: Partial<Record<TrackLeg, { url: string; assignee: string; mobile?: string }>> = {};
    for (const leg of ["pickup", "linehaul", "lastmile"] as TrackLeg[]) {
      const l = legs[leg];
      if (l?.assignee) driverLinks[leg] = { url: driverPath(b.id, leg), assignee: l.assignee, mobile: l.mobile };
    }
    const g = gps[b.id] ?? null;
    moves[b.id] = { trackUrl: trackPath(b.id), driverLinks, gps: g ? { points: g.points.slice(-40), sharing: g.sharing ?? null } : null };
  }
  return NextResponse.json({ moves, at: new Date().toISOString() });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { action?: string; id?: string; at?: string; note?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  const now = new Date().toISOString();

  if (b.action === "eta" || b.action === "clearEta") {
    const at = b.action === "eta" ? new Date(b.at ?? "") : null;
    if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 5 * 60_000)) {
      return NextResponse.json({ error: "BAD_ETA", detail: "Give a date and time in the future." }, { status: 400 });
    }
    const out: { refusal?: string } = {};
    const next = await mutateBooking(sb, b.id, (fresh) => {
      out.refusal = undefined;
      const s = trackState(fresh, Date.now());
      if (!isTrackable(fresh) || !s.next) { out.refusal = `${fresh.id} isn't a move in progress.`; return null; }
      const tracking = { ...((fresh.admin as { tracking?: object }).tracking ?? {}) } as { eta?: TrackEta };
      if (at) tracking.eta = { at: at.toISOString(), next: s.next.key, setAt: now, note: (b.note ?? "").slice(0, 120) || undefined };
      else delete tracking.eta;
      const when = at ? at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
      return {
        ...fresh, admin: { ...fresh.admin, tracking },
        events: [...fresh.events, { at: now, by: "admin" as const, text: at ? `🕒 ETA for "${s.next.name}" set to ${when}${b.note ? ` · ${b.note}` : ""}` : "ETA cleared" }],
      };
    });
    if (out.refusal) return NextResponse.json({ error: "NOT_LIVE", detail: out.refusal }, { status: 409 });
    if (!next) return NextResponse.json({ error: "NOT_SAVED", detail: "The booking changed or couldn't be found — reload and try again." }, { status: 409 });
    return NextResponse.json({ ok: true, booking: next });
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}

