import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/adminAuth";
import type { Booking } from "@/lib/types";

/** Admin reads/writes ALL bookings with the SERVICE ROLE key — this is the
 *  only place in the app that key is used, it never reaches the browser,
 *  and every request here is gated by the admin session cookie (see
 *  src/lib/adminAuth.ts). This is what makes it safe to have removed the
 *  old "anon can select every booking" policy from the database. */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").order("created", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: (data ?? []).map((r) => r.doc as Booking) });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let body: { doc?: Booking };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.doc?.id) return NextResponse.json({ error: "MISSING_DOC" }, { status: 400 });

  const { error } = await sb.from("bookings").upsert({
    id: body.doc.id, doc: body.doc, status: body.doc.status, created: body.doc.created,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: body.doc });
}
