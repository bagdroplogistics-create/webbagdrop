import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { listEvents } from "@/lib/waStore";

/** Automation History (section C) — the event log: incoming messages,
 *  automated responses, leads created/updated, draft quotes generated,
 *  sends/failures, handovers, errors/retries. */
export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  const events = await listEvents(sb, { type, conversationId, limit: 500 });
  return NextResponse.json({ ok: true, events });
}
