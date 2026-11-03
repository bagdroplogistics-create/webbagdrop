import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { prodClient } from "@/lib/supabaseProd";

/** Writes a status change — or, for a lead, a details correction — to
 *  PRODUCTION (bagdrop.co/admin) by proxying to bagdrop-web's OWN admin API
 *  (PATCH /api/admin/leads/:id or /api/admin/bookings/:id) with a
 *  staff-level key, rather than writing to the production tables directly.
 *  That keeps every real side effect — customer status-change emails,
 *  auto-invoicing on delivery, status history, the completed-booking lock,
 *  and (for leads) the booking sync bagdrop-web's own route already does —
 *  exactly as bagdrop-web's own admin already does it; this app never
 *  re-implements that logic. */

/** Lead fields this screen lets staff correct, mapped to bagdrop-web's own
 *  column names (see bagdrop-web/app/api/admin/leads/[id]/route.ts's own,
 *  wider allowlist — this is the subset the quote-desk UI actually shows). */
const LEAD_FIELD_MAP: Record<string, string> = {
  name: "name", phone: "phone", email: "email",
  fromCity: "from_city", toCity: "to_city", serviceInterest: "service_interest",
  travelDate: "travel_date", pickupDate: "pickup_date", deliveryDate: "delivery_date",
  bagsCount: "bags_count", flightNumber: "flight_number", notes: "notes", assignedTo: "assigned_to",
};
/** A route or bag-count change can move the price — refuse it silently
 *  drifting a quote the customer has already seen, same as the native
 *  booking edit (src/lib/inquiryEdit.ts). Staff use "Revise price" instead,
 *  which sends the customer the new number. */
const PRICE_FIELDS = ["fromCity", "toCity", "bagsCount"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const siteUrl = process.env.PROD_SITE_URL;
  const key = process.env.PROD_ADMIN_API_KEY;
  if (!siteUrl || !key) return NextResponse.json({ error: "PROD_ADMIN_API_NOT_CONFIGURED" }, { status: 503 });

  const { id } = await params;
  let body: { target?: "lead" | "booking"; status?: string; totalAmount?: number; notes?: string; fields?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const hasFields = !!body.fields && Object.keys(body.fields).length > 0;
  if (!body.target || (!body.status && body.totalAmount == null && !hasFields)) return NextResponse.json({ error: "MISSING_TARGET_OR_UPDATE" }, { status: 400 });
  if (body.target !== "lead" && body.target !== "booking") return NextResponse.json({ error: "BAD_TARGET" }, { status: 400 });
  // total_amount is a bookings-only column (see bagdrop-web's own
  // app/api/admin/bookings/[id]/route.ts) — not accepted on a lead.
  if (body.target === "lead" && body.totalAmount != null) return NextResponse.json({ error: "TOTAL_AMOUNT_NOT_VALID_FOR_LEAD" }, { status: 400 });
  // Details editing only exists on the lead record in this UI — a booking's
  // own fields have no edit form here, only its status/price actions.
  if (hasFields && body.target !== "lead") return NextResponse.json({ error: "FIELDS_ONLY_VALID_FOR_LEAD" }, { status: 400 });

  const path = body.target === "lead" ? `/api/admin/leads/${id}` : `/api/admin/bookings/${id}`;
  const forward: Record<string, unknown> = {};
  if (body.status) forward.status = body.status;
  if (body.totalAmount != null) forward.total_amount = body.totalAmount;
  if (body.notes) forward.notes = body.notes;

  if (hasFields) {
    for (const [k, v] of Object.entries(body.fields!)) {
      const col = LEAD_FIELD_MAP[k];
      if (col) forward[col] = v;
    }
    if (PRICE_FIELDS.some((f) => f in body.fields!)) {
      const sb = prodClient();
      if (!sb) return NextResponse.json({ error: "PROD_SUPABASE_NOT_CONFIGURED", detail: "Can't verify the current quote to protect it — route and bag-count changes are blocked until this is configured." }, { status: 503 });
      const { data: current, error } = await sb.from("leads").select("booking_id").eq("id", id).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (current?.booking_id) {
        const { data: linkedBooking } = await sb.from("bookings").select("total_amount").eq("id", current.booking_id).maybeSingle();
        if (linkedBooking?.total_amount) {
          return NextResponse.json({
            error: "PRICE_WOULD_CHANGE",
            detail: "This lead already has a quoted price — changing the route or bag count here won't update it. Use “Revise price” to send the customer a corrected quote instead.",
          }, { status: 409 });
        }
      }
    }
  }

  const r = await fetch(`${siteUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-admin-key": key },
    body: JSON.stringify(forward),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: j?.error ?? `PROD_HTTP_${r.status}` }, { status: r.status });
  return NextResponse.json(j);
}
