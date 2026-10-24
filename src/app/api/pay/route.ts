/** Payment authorisation — verifies the quote signature BEFORE any capture.
 *  A tampered total (edited in the browser) fails the HMAC check and is
 *  refused. In production this route also calls Razorpay/Stripe and writes
 *  the booking server-side with the service role; in demo mode it returns
 *  the verified amount for the client to record. */
import { NextResponse } from "next/server";
import { quotePayload, verify } from "@/lib/sign";

export async function POST(req: Request) {
  let b: {
    qid?: string; fromName?: string; toName?: string; bags?: number; oversize?: number;
    total?: number; validUntil?: string; signature?: string;
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const required = [b.qid, b.fromName, b.toName, b.total, b.validUntil, b.signature];
  if (required.some((x) => x === undefined || x === null || x === "")) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  const payload = quotePayload({
    qid: String(b.qid), fromName: String(b.fromName), toName: String(b.toName),
    bags: Number(b.bags) || 0, oversize: Number(b.oversize) || 0,
    total: Number(b.total), validUntil: String(b.validUntil),
  });
  if (!verify(payload, String(b.signature))) {
    return NextResponse.json({ error: "SIGNATURE_MISMATCH", detail: "Quote figures do not match the signed quote. Capture refused." }, { status: 403 });
  }
  if (new Date(String(b.validUntil)).getTime() < Date.now()) {
    return NextResponse.json({ error: "QUOTE_EXPIRED" }, { status: 410 });
  }
  /* Razorpay/Stripe order creation goes here in production. */
  return NextResponse.json({
    ok: true,
    amount: Math.round(Number(b.total)),
    gateway: "Razorpay (demo)",
    capturedAt: new Date().toISOString(),
    reference: `pay_${Math.random().toString(36).slice(2, 12)}`,
  });
}
