import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { runSweep, loadAlerts, saveAlerts, type OutboxDoc } from "@/lib/automation";
import { cleanMobile, cleanEmail } from "@/lib/otp";

/** Automation desk data: outbox stats, the latest events, the dead-letter
 *  queue — plus "run the worker now" for the admin. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("outbox").select("doc, status").order("created", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).map((r) => r.doc as OutboxDoc);
  const alerts = await loadAlerts();
  return NextResponse.json({
    alerts,
    counts: {
      queued: rows.filter((r) => r.status === "queued").length,
      done: rows.filter((r) => r.status === "done").length,
      stubbed: rows.filter((r) => r.status === "done" && r.stub).length,
      dead: rows.filter((r) => r.status === "dead").length,
    },
    recent: rows.slice(0, 30),
    dead: rows.filter((r) => r.status === "dead").slice(0, 20),
    providers: {
      whatsapp: !!process.env.META_WHATSAPP_TOKEN,
      email: !!process.env.RESEND_API_KEY,
      razorpay: !!process.env.RAZORPAY_KEY_ID,
      cron: !!process.env.CRON_SECRET,
    },
  });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let b: { action?: string; mobile?: string; email?: string } = {};
  try { b = await req.json(); } catch { /* empty body = run the sweep */ }

  /* set the ops alert contact — every platform event fans out to it */
  if (b.action === "alerts") {
    const mobile = b.mobile?.trim() ? cleanMobile(b.mobile) : undefined;
    const email = b.email?.trim() ? cleanEmail(b.email) : undefined;
    if (b.mobile?.trim() && !mobile) return NextResponse.json({ error: "BAD_MOBILE" }, { status: 400 });
    if (b.email?.trim() && !email) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    await saveAlerts({ mobile: mobile ?? undefined, email: email ?? undefined });
    return NextResponse.json({ ok: true, alerts: { mobile, email } });
  }

  try {
    const stats = await runSweep();
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "SWEEP_FAILED" }, { status: 500 });
  }
}
