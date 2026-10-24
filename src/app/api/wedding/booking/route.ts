import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { BagdropEvent, Booking } from "@/lib/types";

/** Create-or-update one wedding-desk family booking. Public (guests use it),
 *  but guarded the same way the SECURITY DEFINER RPCs guard the other
 *  customer writes — the anon key itself still has no path to the table:
 *   - the booking must reference an event that exists and is OPEN;
 *   - it must be a wedding booking (uc "wed") with the desk's state attached;
 *   - updating an existing row needs the same event code AND the same lead
 *     mobile it was created with (the desk's booking codes are short, so the
 *     id alone is not treated as a credential the way BD-… tokens are);
 *   - status / admin / created stay server-authoritative on update, so a
 *     guest edit can never un-reject or re-route a booking the ops team has
 *     already acted on.
 */
export async function POST(req: Request) {
  let body: { doc?: Booking };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const doc = body.doc;
  if (!doc?.id || typeof doc.id !== "string" || doc.id.length > 64) {
    return NextResponse.json({ error: "MISSING_DOC" }, { status: 400 });
  }
  if (doc.uc !== "wed" || !doc.eventCode || !doc.wedding) {
    return NextResponse.json({ error: "NOT_A_WEDDING_BOOKING" }, { status: 400 });
  }
  const mobile = String(doc.traveller?.mobile ?? "").replace(/\D/g, "");
  if (mobile.length < 10) return NextResponse.json({ error: "MOBILE_REQUIRED" }, { status: 400 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const { data: ev, error: evErr } = await sb.from("events").select("doc,status").eq("id", doc.eventCode).maybeSingle();
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });
  const event = ev?.doc as BagdropEvent | undefined;
  if (!event || (ev?.status ?? event.status) !== "open") {
    return NextResponse.json({ error: "EVENT_NOT_OPEN" }, { status: 403 });
  }

  const { data: prevRow, error: prevErr } = await sb.from("bookings").select("doc").eq("id", doc.id).maybeSingle();
  if (prevErr) return NextResponse.json({ error: prevErr.message }, { status: 500 });
  const prev = prevRow?.doc as Booking | undefined;

  if (prev) {
    const prevMobile = String(prev.traveller?.mobile ?? "").replace(/\D/g, "");
    if (prev.eventCode !== doc.eventCode || prevMobile.slice(-10) !== mobile.slice(-10)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    // Server-authoritative fields survive the guest's re-save.
    doc.status = prev.status;
    doc.admin = prev.admin ?? {};
    doc.created = prev.created;
    doc.pay = prev.pay ?? null;
  } else {
    doc.status = "submitted";
    doc.created = doc.created || new Date().toISOString();
    doc.admin = {};
    doc.pay = null;
  }

  const { error } = await sb.from("bookings").upsert({
    id: doc.id, doc, status: doc.status, created: doc.created,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: doc });
}
