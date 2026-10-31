import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { Booking } from "@/lib/types";

/** A wedding guest's own family booking, for the /e/[code] desk — replaces
 *  the anon get_booking RPC. Same guard as /api/wedding/booking: the desk's
 *  codes are short, so the id alone is not a credential; the lead mobile it
 *  was booked with must match too. Only what the desk needs comes back —
 *  never admin, payment or identity fields. Mobile travels in the body, not
 *  the URL, so it never lands in access logs. */
export async function POST(req: Request) {
  let b: { id?: string; mobile?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const mobile = String(b.mobile ?? "").replace(/\D/g, "");
  if (!b.id || typeof b.id !== "string" || b.id.length > 64 || mobile.length < 10) {
    return NextResponse.json({ error: "MISSING_ID_OR_MOBILE" }, { status: 400 });
  }
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const { data, error } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const doc = data?.doc as Booking | undefined;
  const own = String(doc?.traveller?.mobile ?? "").replace(/\D/g, "").slice(-10);
  /* not found and not yours look the same, so codes can't be probed */
  if (!doc || !doc.wedding || own !== mobile.slice(-10)) return NextResponse.json({ booking: null });
  return NextResponse.json({ booking: { id: doc.id, status: doc.status, events: doc.events, wedding: doc.wedding } });
}
