import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { BagdropEvent, Booking } from "@/lib/types";

/** Mirrors every new Y2K booking into a Google Sheet, alongside the Admin OS,
 *  via a Google Apps Script "Web App" (see the setup doc for the script and
 *  deployment steps). Fire-and-forget: a Sheets outage never blocks a real
 *  booking, which has already been saved to Supabase by the time this runs.
 *  Configured with Y2K_SHEET_WEBHOOK_URL + Y2K_SHEET_SECRET — both unset
 *  until the team deploys the Apps Script, so this silently no-ops until
 *  then. Only fires for brand-new bookings, not edits, so re-saving a
 *  booking from the desk doesn't add a duplicate row. */
function notifySheet(doc: Booking) {
  const url = process.env.Y2K_SHEET_WEBHOOK_URL;
  if (!url) return;
  const payload = {
    secret: process.env.Y2K_SHEET_SECRET ?? "",
    bookingId: doc.id,
    createdAt: doc.created,
    familyName: doc.family?.name ?? "",
    leadName: doc.traveller?.name ?? "",
    mobile: doc.traveller?.mobile ?? "",
    email: doc.traveller?.email ?? "",
    side: doc.family?.side ?? "",
    travellers: doc.family?.guests ?? "",
    bags: doc.bags ?? "",
    oversize: doc.oversize ?? "",
    fromCity: doc.from ?? "",
    toCity: doc.to ?? "",
    pickupDate: doc.date ?? "",
    pickupSlot: doc.slot ?? "",
    note: doc.note ?? "",
  };
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((e) => console.error("Y2K sheet webhook failed:", e));
}

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
  const isNew = !prev;

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
  if (isNew) notifySheet(doc);
  return NextResponse.json({ ok: true, booking: doc });
}
