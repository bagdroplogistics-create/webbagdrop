import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { latestFix, readGps, readTrackToken } from "@/lib/trackLinks";
import { isTrackable, publicTrack } from "@/lib/tracking";
import type { Booking } from "@/lib/types";

/** Public live tracking for one booking, behind its signed link (/t/<token>).
 *  Shows first name, lane, stages, ETA and position only — no address,
 *  phone or price. The link stops working at delivery. */
export async function GET(req: Request) {
  const id = readTrackToken(new URL(req.url).searchParams.get("t") ?? "");
  if (!id) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b || !isTrackable(b)) return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  const t = publicTrack(b, Date.now(), latestFix((await readGps(sb, [id]))[id]));
  if (t.ended) return NextResponse.json({ ended: true, ref: t.ref, deliveredAt: t.deliveredAt }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ track: t }, { headers: { "Cache-Control": "no-store" } });
}
