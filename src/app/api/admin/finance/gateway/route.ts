import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { razorpayConfigured } from "@/lib/razorpay";
import { loadRecon, runApiRecon, runCsvRecon, setResolved } from "@/lib/gatewayRecon";

/** Finance · payment gateway reconciliation (Razorpay).
 *   GET  → the last run, the team's resolved notes, whether API keys are set
 *   POST {action:"run", from, to}      pull Razorpay (payments, refunds, settlements) and match
 *        {action:"csv", csv}           the same from a Razorpay CSV report
 *        {action:"resolve", key, note} mark an issue explained · {action:"reopen", key} */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const doc = await loadRecon(sb);
  return NextResponse.json({ ...doc, apiReady: razorpayConfigured(), mode: (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_live") ? "live" : "test" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { action?: string; from?: string; to?: string; csv?: string; key?: string; note?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const day = /^\d{4}-\d{2}-\d{2}$/;
  try {
    switch (b.action) {
      case "run": {
        if (!day.test(b.from ?? "") || !day.test(b.to ?? "") || b.from! > b.to!) return NextResponse.json({ error: "BAD_RANGE", detail: "Pick a valid from and to date." }, { status: 400 });
        if (Date.parse(b.to!) - Date.parse(b.from!) > 92 * 86_400_000) return NextResponse.json({ error: "BAD_RANGE", detail: "Up to 3 months at a time." }, { status: 400 });
        const r = await runApiRecon(sb, b.from!, b.to!);
        return NextResponse.json({ ok: true, issues: r.issues.length, payments: r.payments.length });
      }
      case "csv": {
        if (!b.csv || b.csv.length > 5_000_000) return NextResponse.json({ error: "BAD_CSV", detail: "Upload a Razorpay CSV report (up to 5 MB)." }, { status: 400 });
        const r = await runCsvRecon(sb, b.csv);
        return NextResponse.json({ ok: true, kind: r.kind, issues: r.issues.length, payments: r.payments.length });
      }
      case "resolve": {
        if (!b.key || !(b.note ?? "").trim()) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Say how it was resolved." }, { status: 400 });
        await setResolved(sb, b.key, b.note!.trim());
        return NextResponse.json({ ok: true });
      }
      case "reopen": {
        if (!b.key) return NextResponse.json({ error: "MISSING_KEY" }, { status: 400 });
        await setResolved(sb, b.key, null);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: "RECON_FAILED", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
