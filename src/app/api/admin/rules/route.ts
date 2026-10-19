import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";

/** Rule on/off state — persisted to settings/rules, same table/shape the
 *  original static build used (admin.js:1825-1843). As in the original,
 *  toggling a rule doesn't change any actual send behavior anywhere else
 *  (no dispatcher reads this) — it's a real, saved on/off switch over a
 *  currently-decorative effect. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("settings").select("doc").eq("id", "rules").maybeSingle();
  return NextResponse.json({ state: (data?.doc as { state?: Record<string, boolean> } | undefined)?.state ?? {} });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { state?: Record<string, boolean> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.state) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { error } = await sb.from("settings").upsert({ id: "rules", doc: { state: b.state }, status: null, created: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, state: b.state });
}
