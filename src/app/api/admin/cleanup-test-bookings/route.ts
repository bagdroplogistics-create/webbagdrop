import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { looksLikeTestBooking } from "@/lib/automation";
import type { Booking } from "@/lib/types";

/** One-off cleanup for QA/test bookings that ended up in the live bookings
 *  table (same \btest\b match automation.ts already uses to skip them for
 *  notifications — src/lib/automation.ts:45). GET previews what would be
 *  removed; POST with {"confirm":true} actually deletes those bookings and
 *  their CRM lead rows. Requires an active BAGDROP OS admin session — never
 *  callable without the cookie isAdminRequest() checks for. */

interface TestBookingRow { id: string; status: string; name: string; mobile: string }

async function matches(): Promise<TestBookingRow[]> {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc");
  const rows = (data ?? []).map((r) => r.doc as Booking).filter(looksLikeTestBooking);
  return rows.map((b) => ({ id: b.id, status: b.status, name: b.traveller.name, mobile: b.traveller.mobile }));
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!serviceClient()) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const rows = await matches();
  return NextResponse.json({ ok: true, dryRun: true, count: rows.length, bookings: rows });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) return NextResponse.json({ error: "CONFIRM_REQUIRED", detail: 'POST {"confirm": true} to actually delete.' }, { status: 400 });

  const rows = await matches();
  if (rows.length === 0) return NextResponse.json({ ok: true, deleted: 0, bookings: [] });

  const ids = rows.map((r) => r.id);
  const delCrm = await sb.from("crm").delete().in("refId", ids);
  const delBookings = await sb.from("bookings").delete().in("id", ids);
  if (delBookings.error) return NextResponse.json({ error: "DELETE_FAILED", detail: delBookings.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: rows.length, crmRowsDeleted: delCrm.error ? null : true, bookings: rows });
}
