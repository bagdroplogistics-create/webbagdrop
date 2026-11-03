import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { weddingAction, type OpsBody } from "@/lib/weddingOpsHandler";

/** BAGDROP OS · wedding desk actions on any event:
 *   POST {action:"setRoom", id, memberId, room} · {action:"setBagRoom", id, bagId, room}
 *        {action:"acceptReturn", tag, condition:"ok"|"damaged", note}
 *        {action:"reply", id, text} · {action:"rooming", event, csv, apply?} */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let body: OpsBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  return weddingAction(sb, { kind: "bagdrop", name: "BAGDROP OS" }, body, null);
}
