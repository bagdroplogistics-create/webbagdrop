import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { Inquiry } from "@/lib/types";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("inquiries").select("doc").order("created", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inquiries: (data ?? []).map((r) => r.doc as Inquiry) });
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { id?: string; status?: Inquiry["status"] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.status) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: cur, error: getErr } = await sb.from("inquiries").select("doc").eq("id", b.id).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc: Inquiry = { ...(cur.doc as Inquiry), status: b.status };
  const { error } = await sb.from("inquiries").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inquiry: doc });
}
