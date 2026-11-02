import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { listAudit } from "@/lib/users";

/** Security & audit: who did what in BAGDROP OS, newest first (needs View on Security & audit). */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ entries: await listAudit(sb, 300) }, { headers: { "Cache-Control": "no-store" } });
}
