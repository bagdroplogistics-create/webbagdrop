import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { handleInbound, signatureOk } from "@/lib/bagJourney";
import { kickSweep } from "@/lib/automation";

/** SITA → Bagdrop webhook (Bag Journey inbound, blueprint I-2 / I-4 / I-6 / I-7).
 *  The body must be signed: header x-sita-signature: sha256=<HMAC-SHA256 of
 *  the raw body with SITA_WEBHOOK_SECRET>. Each eventId is processed once;
 *  a repeat answers 200 {duplicate:true} so SITA's retries are harmless.
 *  The transport is provisional until SITA shares the interface spec. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 20_000) return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  if (!signatureOk(raw, req.headers.get("x-sita-signature"))) return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const r = await handleInbound(sb, body);
  if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.error === "BAD_EVENT" ? 400 : 404 });
  if (!r.duplicate) kickSweep();
  return NextResponse.json(r);
}
