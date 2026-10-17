import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { financialYear } from "@/lib/docs";
import type { Trip } from "@/lib/types";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("trips").select("doc").order("created", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trips: (data ?? []).map((r) => r.doc as Trip) });
}

/** Creates a new trip. The id is a real document number (TR/FY/0001, with
 *  slashes replaced by dashes to make a usable row id) from the database's
 *  race-safe next_doc_no() — never generated client-side. */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { route?: string; date?: string; vehicle?: string; vehicleType?: string; driver?: string; driverMobile?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.route || !b.date) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: no, error: noErr } = await sb.rpc("next_doc_no", { p_type: "TR", p_fy: financialYear() });
  if (noErr) return NextResponse.json({ error: noErr.message }, { status: 500 });
  const id = String(no).replace(/\//g, "-");

  const doc: Trip = {
    id, created: new Date().toISOString(), status: "planned",
    route: b.route, date: b.date, vehicle: (b.vehicle ?? "").toUpperCase(), vehicleType: b.vehicleType ?? "",
    driver: b.driver ?? "", driverMobile: b.driverMobile ?? "", expenses: [], advances: [],
  };
  const { error } = await sb.from("trips").upsert({ id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, trip: doc });
}

/** Partial update (status change, append an expense/advance). */
export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { id?: string; patch?: Partial<Trip> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.patch) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: cur, error: getErr } = await sb.from("trips").select("doc").eq("id", b.id).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc: Trip = { ...(cur.doc as Trip), ...b.patch };
  const { error } = await sb.from("trips").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, trip: doc });
}
