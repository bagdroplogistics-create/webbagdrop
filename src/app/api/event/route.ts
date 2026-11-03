import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { BagdropEvent } from "@/lib/types";

/** Public view of ONE open event for the guest pages (/weddings, /e/[code]):
 *  what a guest needs to book, without the host's mobile, planner contacts,
 *  the event company's team or internal rates. Replaces the direct anon read
 *  of the events table (closed by migration_004_private_events.sql). */
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase().slice(0, 40);
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) return NextResponse.json({ error: "BAD_CODE" }, { status: 400 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("events").select("doc").eq("id", code).eq("status", "open").maybeSingle();
  const e = data?.doc as BagdropEvent | undefined;
  if (!e) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const pub: Partial<BagdropEvent> = {
    id: e.id, created: e.created, status: e.status, name: e.name, type: e.type, venueCity: e.venueCity, venue: e.venue,
    dates: e.dates, direction: e.direction, billing: e.billing, sectors: e.sectors, landing: e.landing, page: e.page,
    bookingCloses: e.bookingCloses, pickupDays: e.pickupDays,
  };
  return NextResponse.json({ event: pub }, { headers: { "Cache-Control": "no-store" } });
}
