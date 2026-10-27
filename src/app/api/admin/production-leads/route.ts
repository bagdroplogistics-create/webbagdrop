import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { prodClient } from "@/lib/supabaseProd";

/** Read-only view onto the PRODUCTION leads (bagdrop.co/admin's own
 *  `leads` table, joined with its linked `bookings` row for fulfillment
 *  status). GET only — this route never writes to production. Mirrors the
 *  query params bagdrop-web's own /api/admin/leads uses (status, search,
 *  page, limit) so behavior matches what the team already expects there. */

export interface ProductionLead {
  id: string;
  leadNumber: string | null;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  serviceInterest: string | null;
  fromCity: string | null;
  toCity: string | null;
  travelDate: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  bagsCount: number | null;
  notes: string | null;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  booking: { trackingId: string | null; status: string | null } | null;
}

export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = prodClient();
  if (!sb) return NextResponse.json({ error: "PROD_SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = (page - 1) * limit;

  interface LeadRow {
    id: string; lead_number: string | null; name: string; phone: string; email: string | null;
    source: string | null; service_interest: string | null; from_city: string | null; to_city: string | null;
    travel_date: string | null; pickup_date: string | null; delivery_date: string | null;
    bags_count: number | null; notes: string | null; status: string; assigned_to: string | null;
    created_at: string; booking_id: string | null;
  }

  let query = sb
    .from("leads")
    .select(
      "id, lead_number, name, phone, email, source, service_interest, from_city, to_city, travel_date, pickup_date, delivery_date, bags_count, notes, status, assigned_to, created_at, booking_id",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== "all") query = query.eq("status", status);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

  const { data: rawData, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const data = rawData as unknown as LeadRow[];

  const bookingIds = data.map((l) => l.booking_id).filter((id): id is string => !!id);
  let bookingsById: Record<string, { tracking_id: string | null; status: string | null }> = {};
  if (bookingIds.length > 0) {
    const { data: bookings } = await sb.from("bookings").select("id, tracking_id, status").in("id", bookingIds);
    bookingsById = Object.fromEntries((bookings ?? []).map((b) => [b.id, { tracking_id: b.tracking_id, status: b.status }]));
  }

  const leads: ProductionLead[] = (data ?? []).map((l) => ({
    id: l.id,
    leadNumber: l.lead_number,
    name: l.name,
    phone: l.phone,
    email: l.email,
    source: l.source,
    serviceInterest: l.service_interest,
    fromCity: l.from_city,
    toCity: l.to_city,
    travelDate: l.travel_date,
    pickupDate: l.pickup_date,
    deliveryDate: l.delivery_date,
    bagsCount: l.bags_count,
    notes: l.notes,
    status: l.status,
    assignedTo: l.assigned_to,
    createdAt: l.created_at,
    booking: l.booking_id
      ? { trackingId: bookingsById[l.booking_id]?.tracking_id ?? null, status: bookingsById[l.booking_id]?.status ?? null }
      : null,
  }));

  return NextResponse.json({ leads, total: count ?? leads.length, page, limit });
}
