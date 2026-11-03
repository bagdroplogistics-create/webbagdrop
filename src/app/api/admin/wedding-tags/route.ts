import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { tagSheet } from "@/lib/weddingTagSheet";

/** BAGDROP OS · wedding bag tags — one tag per bag booked.
 *   GET ?event=Y2K-WED[&id=Y2K-F…][&media=4x6|ql62x100|a4][&only=new|reprint][&mark=1][&print=1]
 *   → print-ready HTML (see lib/weddingTagSheet.ts). */
export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  return tagSheet(sb, req.url, null);
}
