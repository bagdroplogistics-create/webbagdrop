import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";

/** UPI/bank payment acceptance details — the interim rail until the
 *  gateway keys activate. Set by the team in Finance → Banking; the public
 *  GET feeds the /q payment page's QR + bank panel (these details are
 *  MEANT for customers, so no auth on read). */

export interface PayConfig {
  upiId?: string;          // e.g. bagdrop@iob — the company VPA (Google Pay accepts)
  payeeName?: string;
  bankName?: string; accountName?: string; accountNo?: string; ifsc?: string;
  note?: string;
}

export async function GET() {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ config: {} });
  const { data } = await sb.from("settings").select("doc").eq("id", "payconfig").maybeSingle();
  return NextResponse.json({ config: (data?.doc as PayConfig | null) ?? {} });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: PayConfig;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const upiId = b.upiId?.trim().toLowerCase();
  if (upiId && !/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/i.test(upiId)) {
    return NextResponse.json({ error: "BAD_UPI", detail: "UPI ID should look like name@bank (e.g. bagdrop@iob)." }, { status: 400 });
  }
  const config: PayConfig = {
    upiId: upiId || undefined,
    payeeName: b.payeeName?.trim() || undefined,
    bankName: b.bankName?.trim() || undefined,
    accountName: b.accountName?.trim() || undefined,
    accountNo: b.accountNo?.trim() || undefined,
    ifsc: b.ifsc?.trim().toUpperCase() || undefined,
    note: b.note?.trim() || undefined,
  };
  const { error } = await sb.from("settings").upsert({ id: "payconfig", doc: config, status: null, created: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config });
}
