import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { Booking } from "@/lib/types";

/** Track-by-mobile for a wedding/event landing page. Public, but narrow:
 *  the caller must present the event code AND the full 10-digit mobile the
 *  family booked with — the same two things the guest already knows. Only a
 *  reduced projection (no addresses, no payer, no full document) ever leaves.
 *  This replaces the static build's "anon lists the whole bookings table and
 *  filters in the browser", which the tightened RLS rightly forbids. */
export async function POST(req: Request) {
  let body: { event?: string; mobile?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const event = String(body.event ?? "").slice(0, 40);
  const digits = String(body.mobile ?? "").replace(/\D/g, "");
  if (!event) return NextResponse.json({ error: "MISSING_EVENT" }, { status: 400 });
  if (digits.length < 10) return NextResponse.json({ error: "MOBILE_TOO_SHORT" }, { status: 400 });
  const last10 = digits.slice(-10);

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const { data, error } = await sb.from("bookings").select("doc").eq("doc->>eventCode", event).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookings = (data ?? [])
    .map((r) => r.doc as Booking)
    .filter((d) => (d.traveller?.mobile ?? "").replace(/\D/g, "").includes(last10))
    .map((d) => ({
      id: d.id, status: d.status, bags: d.bags, from: d.from, to: d.to, date: d.date,
      familyName: d.family?.name ?? null, travellerName: d.traveller?.name ?? "",
    }));
  return NextResponse.json({ bookings });
}
