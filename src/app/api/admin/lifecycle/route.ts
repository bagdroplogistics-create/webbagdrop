import { NextResponse } from "next/server";
import { actorName, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { cancelBooking, restoreBooking } from "@/lib/lifecycle";

/** Cancel / restore a booking (needs Edit on Shipments — src/lib/access.ts).
 *  POST { id, action: "cancel", reason } · POST { id, action: "restore" } */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { id?: string; action?: string; reason?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !["cancel", "restore"].includes(b.action ?? "")) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  const by = await actorName();
  const r = b.action === "cancel" ? await cancelBooking(sb, b.id, by, b.reason ?? "") : await restoreBooking(sb, b.id, by);
  if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
  return NextResponse.json({ ok: true, booking: r.booking });
}
