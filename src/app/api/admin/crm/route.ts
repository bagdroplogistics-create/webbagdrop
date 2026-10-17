import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import type { CrmActivity } from "@/lib/types";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("crm").select("doc").order("created", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: (data ?? []).map((r) => r.doc as CrmActivity) });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: Omit<CrmActivity, "id" | "created">;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.text) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const doc: CrmActivity = { ...b, id: newToken("CRM", 8), created: new Date().toISOString() };
  const { error } = await sb.from("crm").upsert({ id: doc.id, doc, status: null, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, activity: doc });
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { id?: string; doneAt?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: cur, error: getErr } = await sb.from("crm").select("doc").eq("id", b.id).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc: CrmActivity = { ...(cur.doc as CrmActivity), doneAt: b.doneAt ?? new Date().toISOString() };
  const { error } = await sb.from("crm").upsert({ id: doc.id, doc, status: null, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, activity: doc });
}
