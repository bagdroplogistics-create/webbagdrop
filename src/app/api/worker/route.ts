import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { runSweep } from "@/lib/automation";

/** The automation worker. Triggered three ways, all equivalent (the sweep
 *  is idempotent): Vercel Cron (Authorization: Bearer CRON_SECRET, which
 *  Vercel injects automatically when that env var exists), an admin
 *  session (the Automation desk's "Run now"), or opportunistic kicks after
 *  server-side writes. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const cron = process.env.CRON_SECRET;
  const fromCron = !!cron && auth === `Bearer ${cron}`;
  if (!fromCron && !(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const stats = await runSweep();
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "SWEEP_FAILED" }, { status: 500 });
  }
}
export const POST = GET;
