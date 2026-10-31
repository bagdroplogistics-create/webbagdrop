import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { ensurePaymentLink } from "@/lib/paymentLinks";

/** BAGDROP OS · get (or make) the Razorpay payment link for what a booking
 *  owes now — used by the Inbox's "WhatsApp payment details" and "Copy pay
 *  link". The amount comes from the booking; an existing link is reused
 *  while it is still for the right amount.
 *  Request { id }  →  { url, amount, kind } */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { id?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const link = await ensurePaymentLink(sb, b.id, new URL(req.url).origin);
  if ("error" in link) {
    const status = link.error === "NOT_FOUND" ? 404 : link.error === "GATEWAY_NOT_CONFIGURED" ? 503 : link.error === "GATEWAY_ERROR" ? 502 : 409;
    return NextResponse.json(link, { status });
  }
  return NextResponse.json({ url: link.url, amount: link.amount, kind: link.kind, expireBy: link.expireBy });
}
