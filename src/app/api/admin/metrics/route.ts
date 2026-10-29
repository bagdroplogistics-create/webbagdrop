import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { computeMetrics, parsePeriod } from "@/lib/metricsServer";
import { serviceClient } from "@/lib/supabaseAdmin";

/** Full executive-dashboard payload (every department), admin cookie only.
 *  The aggregation itself lives in src/lib/metricsServer.ts, shared with the
 *  read-only scoped board route (/api/board/metrics). */
export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  const period = parsePeriod(new URL(req.url).searchParams.get("period"));
  const m = await computeMetrics(sb, period);
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: 500 });
  return NextResponse.json(m);
}
