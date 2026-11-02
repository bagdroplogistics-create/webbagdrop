import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { readDriverToken, readGps, latestFix, writeGps } from "@/lib/trackLinks";
import { LEG_END, LEG_NAME, isTrackable } from "@/lib/tracking";
import { inBox } from "@/lib/geo";
import { opsOf } from "@/lib/opsModel";
import type { Booking } from "@/lib/types";

/** The driver's page (/d/<token>, one booking + one leg).
 *   GET  the job: lane, address for this leg, bags, whether the leg is open
 *   POST {t, lat, lng, acc}  a GPS fix (kept at most every 15 s)
 *   POST {t, stop: true}     the driver tapped Done
 *  The leg closes by itself once its end milestone is scanned in
 *  Operations; the page is then told to stop sharing. */
const MIN_GAP_MS = 15_000;

async function load(token: string) {
  const d = readDriverToken(token);
  if (!d) return null;
  const sb = serviceClient();
  if (!sb) return null;
  const { data } = await sb.from("bookings").select("doc").eq("id", d.id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b || !isTrackable(b)) return null;
  const open = !opsOf(b).milestones?.[LEG_END[d.leg]] && !["delivered", "cancelled", "rejected"].includes(b.status);
  return { sb, b, leg: d.leg, open };
}

export async function GET(req: Request) {
  const j = await load(new URL(req.url).searchParams.get("t") ?? "");
  if (!j) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  const { b, leg, open, sb } = j;
  const g = (await readGps(sb, [b.id]))[b.id];
  const legInfo = opsOf(b).legs?.[leg];
  return NextResponse.json({
    ref: b.id, leg, legName: LEG_NAME[leg], open, lane: `${b.from} → ${b.to}`, mode: b.mode,
    pieces: b.bags + b.oversize, oversize: b.oversize, date: (b.pickupDate || b.date).slice(0, 10), slot: b.slot,
    address: leg === "pickup" ? b.pickAddr : leg === "lastmile" ? b.dropAddr : `${b.from} hub → ${b.to} hub`,
    customer: leg === "linehaul" ? null : (b.traveller.name ?? "").split(/\s+/)[0],
    driver: legInfo?.assignee ?? null,
    sharing: g?.sharing?.leg === leg, lastFix: latestFix(g)?.leg === leg ? latestFix(g)!.at : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: { t?: string; lat?: number; lng?: number; acc?: number; stop?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const j = await load(body.t ?? "");
  if (!j) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  const { sb, b, leg, open } = j;
  const now = new Date().toISOString();

  if (body.stop || !open) {
    await writeGps(sb, b.id, (g) => ({ ...g, sharing: g.sharing?.leg === leg ? null : g.sharing ?? null }));
    return NextResponse.json({ ok: true, stop: true, reason: open ? "STOPPED" : "LEG_COMPLETE" });
  }
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBox({ lat, lng })) return NextResponse.json({ error: "BAD_FIX" }, { status: 400 });
  let kept = false;
  await writeGps(sb, b.id, (g) => {
    const last = g.points[g.points.length - 1];
    const sharing = g.sharing?.leg === leg ? g.sharing : { leg, since: now };
    if (last && last.leg === leg && Date.now() - Date.parse(last.at) < MIN_GAP_MS) return { ...g, sharing };
    kept = true;
    const acc = Number.isFinite(Number(body.acc)) ? Math.round(Number(body.acc)) : undefined;
    return { points: [...g.points, { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, acc, at: now, leg }], sharing };
  });
  return NextResponse.json({ ok: true, kept, stop: false });
}
