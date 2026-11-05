import { NextResponse } from "next/server";
import { actorName, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { mutateBooking } from "@/lib/bookingStore";
import { lrTotals, type LrDetails } from "@/lib/lrModel";
import type { Booking } from "@/lib/types";

/** Amend an issued LR (Edit on LR & trips). The LR number stays; the
 *  details and the LR amount change, every amendment is logged, and the
 *  printed note shows the latest version. PATCH { id, lr, reason } */
export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { id?: string; lr?: LrDetails; reason?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.lr) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  if ((b.reason ?? "").trim().length < 3) return NextResponse.json({ error: "REASON_REQUIRED", detail: "Say what changed and why; it goes on the booking's log." }, { status: 400 });
  if (!b.lr.consignee?.trim() || !b.lr.consigneeMobile?.trim()) return NextResponse.json({ error: "MISSING_FIELDS", detail: "Consignee name and mobile are needed." }, { status: 400 });
  const by = await actorName();
  let refused: string | null = null;
  const next = await mutateBooking(sb, b.id!, (doc) => {
    if (!doc.lr) { refused = "NO_LR"; return null; }
    if (doc.status === "delivered") { refused = "DELIVERED"; return null; }
    const now = new Date().toISOString();
    const amount = lrTotals(b.lr, doc.quote.total || 0).total;
    const prev = (doc.admin as { lrDetails?: LrDetails }).lrDetails ?? {};
    const diffs = Object.keys({ ...prev, ...b.lr }).filter((k) => String((prev as Record<string, unknown>)[k] ?? "") !== String((b.lr as Record<string, unknown>)[k] ?? "")).filter((k) => k !== "charges");
    const history = ((doc.admin as { lrHistory?: unknown[] }).lrHistory ?? []) as unknown[];
    const version = history.length + 2;
    return {
      ...doc,
      admin: { ...doc.admin, lrDetails: b.lr, lrHistory: [...history, { at: now, by, reason: b.reason!.trim(), details: prev }], lrVersion: version },
      docs: (doc.docs ?? []).map((d) => (d.type === "LR" && d.no === doc.lr!.no ? { ...d, amount } : d)),
      events: [...doc.events, { at: now, by: "admin", text: `LR ${doc.lr.no} amended (v${version}) by ${by} — ${b.reason!.trim()}${diffs.length ? ` · ${diffs.join(", ")}` : ""}` }],
    } as Booking;
  });
  if (refused === "NO_LR") return NextResponse.json({ error: "NO_LR", detail: "This booking has no LR yet." }, { status: 409 });
  if (refused === "DELIVERED") return NextResponse.json({ error: "DELIVERED", detail: "A delivered booking's LR can't be amended." }, { status: 409 });
  if (!next) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, booking: next });
}
