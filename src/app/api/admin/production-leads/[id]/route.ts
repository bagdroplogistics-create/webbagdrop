import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";

/** Writes a status change to PRODUCTION (bagdrop.co/admin) — proxies to
 *  bagdrop-web's OWN admin API (PATCH /api/admin/leads/:id or
 *  /api/admin/bookings/:id) with a staff-level key, rather than writing to
 *  the production tables directly. That keeps every real side effect —
 *  customer status-change emails, auto-invoicing on delivery, status
 *  history, the completed-booking lock — exactly as bagdrop-web's own
 *  admin already does it; this app never re-implements that logic. */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const siteUrl = process.env.PROD_SITE_URL;
  const key = process.env.PROD_ADMIN_API_KEY;
  if (!siteUrl || !key) return NextResponse.json({ error: "PROD_ADMIN_API_NOT_CONFIGURED" }, { status: 503 });

  const { id } = await params;
  let body: { target?: "lead" | "booking"; status?: string; totalAmount?: number; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.target || (!body.status && body.totalAmount == null)) return NextResponse.json({ error: "MISSING_TARGET_OR_UPDATE" }, { status: 400 });
  if (body.target !== "lead" && body.target !== "booking") return NextResponse.json({ error: "BAD_TARGET" }, { status: 400 });
  // total_amount is a bookings-only column (see bagdrop-web's own
  // app/api/admin/bookings/[id]/route.ts) — not accepted on a lead.
  if (body.target === "lead" && body.totalAmount != null) return NextResponse.json({ error: "TOTAL_AMOUNT_NOT_VALID_FOR_LEAD" }, { status: 400 });

  const path = body.target === "lead" ? `/api/admin/leads/${id}` : `/api/admin/bookings/${id}`;
  const forward: Record<string, unknown> = {};
  if (body.status) forward.status = body.status;
  if (body.totalAmount != null) forward.total_amount = body.totalAmount;
  if (body.notes) forward.notes = body.notes;
  const r = await fetch(`${siteUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-admin-key": key },
    body: JSON.stringify(forward),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: j?.error ?? `PROD_HTTP_${r.status}` }, { status: r.status });
  return NextResponse.json(j);
}
