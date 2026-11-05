import { NextResponse } from "next/server";
import { actorName, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { amendPaidQuote } from "@/lib/quoteAmend";
import type { InquiryChanges } from "@/lib/inquiryEdit";

/** Change a paid booking from the quote desk (Edit on Shipments). The
 *  difference becomes a top-up due or a credit note — src/lib/quoteAmend.ts. */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { id?: string; changes?: InquiryChanges; reason?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.changes || typeof b.changes !== "object") return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  const r = await amendPaidQuote(sb, b.id, b.changes, await actorName(), b.reason ?? "");
  if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
  return NextResponse.json({ ok: true, booking: r.booking, changed: r.changed, delta: r.delta, creditNote: r.creditNote ?? null });
}
