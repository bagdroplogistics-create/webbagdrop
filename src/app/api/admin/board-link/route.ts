import { NextResponse } from "next/server";
import { isAdminRequest, makeBoardToken } from "@/lib/adminAuth";
import { VIEWS } from "@/lib/metricsTypes";

/** Mint a read-only, department-scoped board link (admin only). The link is
 *  a signed expiring token — share it with a department head; it opens their
 *  live board at /board/<token> with no admin login and no write access. */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { view?: string; days?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const view = String(body.view ?? "");
  if (!VIEWS.some((v) => v.key === view)) return NextResponse.json({ error: "BAD_VIEW" }, { status: 400 });
  const days = Math.min(365, Math.max(1, Number(body.days) || 30));

  const token = makeBoardToken(view, days);
  const expires = new Date(Number(token.split(".")[1])).toISOString();
  return NextResponse.json({ ok: true, view, days, expires, path: `/board/${token}` });
}
