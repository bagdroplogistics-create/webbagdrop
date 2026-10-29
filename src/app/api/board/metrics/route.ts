import { NextResponse } from "next/server";
import { verifyBoardToken } from "@/lib/adminAuth";
import { computeMetrics, parsePeriod, scopeMetrics } from "@/lib/metricsServer";
import type { ViewKey } from "@/lib/metricsTypes";
import { VIEWS } from "@/lib/metricsTypes";
import { serviceClient } from "@/lib/supabaseAdmin";

/** Read-only board metrics for department heads. Auth is the signed board
 *  token itself (minted by an admin at /api/admin/board-link); it grants
 *  exactly one department's slice, nothing else — the payload is scoped
 *  server-side, so a Finance link never carries Ops or CEO numbers. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const view = verifyBoardToken(token);
  if (!view || !VIEWS.some((v) => v.key === view)) {
    return NextResponse.json({ error: "LINK_EXPIRED_OR_INVALID" }, { status: 401 });
  }
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const m = await computeMetrics(sb, parsePeriod(url.searchParams.get("period")));
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: 500 });
  return NextResponse.json({ view, metrics: scopeMetrics(m, view as ViewKey) });
}
