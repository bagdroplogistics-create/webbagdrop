import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { clientFromCookie, ownsBooking } from "@/lib/clientAuth";
import { clientView } from "@/lib/clientView";
import { isPaid } from "@/lib/payState";
import { mutateBooking } from "@/lib/bookingStore";
import { createOrder, razorpayConfigured, RazorpayError } from "@/lib/razorpay";
import type { Booking } from "@/lib/types";

/** Razorpay Standard Checkout · step 1 — create the order for a booking the
 *  signed-in client owns. The AMOUNT IS DECIDED HERE from the booking (the
 *  approved total, or the extra-bags top-up), never taken from the browser.
 *  The order id is kept on the booking so /api/verify-payment can only
 *  settle this booking, for this amount.
 *
 *  Request  { id: bookingId, kind?: "full" | "topup" }
 *  Response { order_id, amount (paise), currency, key_id, name, description, prefill } */
export async function POST(req: Request) {
  if (!razorpayConfigured()) return NextResponse.json({ error: "GATEWAY_NOT_CONFIGURED", detail: "Online payment isn't switched on yet — please pay by UPI or bank transfer." }, { status: 503 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const who = clientFromCookie(req.headers.get("cookie"));
  if (!who) return NextResponse.json({ error: "UNAUTHORIZED", detail: "Please sign in to My bookings again." }, { status: 401 });

  let body: { id?: string; kind?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const kind = body.kind === "topup" ? "topup" : "full";
  if (!body.id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const { data } = await sb.from("bookings").select("doc").eq("id", body.id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b || !ownsBooking(who, b)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const payable = (x: Booking): number | string => {
    if (!clientView(x).canPay) return "NOT_PAYABLE";
    if (kind === "full") {
      if (isPaid(x)) return "ALREADY_PAID";
      if (x.pay?.status === "submitted") return "UNDER_VERIFICATION";
      return x.quote.total;
    }
    if (!isPaid(x) || !x.pay?.topup || x.pay.topup.status === "submitted") return "NO_TOPUP_DUE";
    return x.pay.topup.amount;
  };
  const amount = payable(b);
  if (typeof amount === "string") {
    const detail: Record<string, string> = {
      NOT_PAYABLE: "This booking isn't awaiting a payment right now.",
      ALREADY_PAID: "This booking is already paid.",
      UNDER_VERIFICATION: "Your payment proof is already with finance for verification.",
      NO_TOPUP_DUE: "There's no extra amount due on this booking.",
    };
    return NextResponse.json({ error: amount, detail: detail[amount] }, { status: 409 });
  }
  if (Math.round(amount * 100) < 100) return NextResponse.json({ error: "AMOUNT_TOO_LOW", detail: "The minimum online payment is ₹1." }, { status: 400 });

  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder(amount, `${b.id}-${kind}`, { bookingId: b.id, kind });
  } catch (e) {
    if (e instanceof RazorpayError && e.auth) return NextResponse.json({ error: "GATEWAY_AUTH_FAILED", detail: "Online payment is unavailable right now — please pay by UPI or bank transfer." }, { status: 401 });
    return NextResponse.json({ error: "GATEWAY_ERROR", detail: "Couldn't start the payment — please try again in a minute." }, { status: 500 });
  }

  /* remember the order on the booking — re-checked on the fresh copy */
  const saved = await mutateBooking(sb, b.id, (fresh) =>
    payable(fresh) === amount
      ? { ...fresh, admin: { ...fresh.admin, rzpOrder: { id: order.orderId, amount, kind, at: new Date().toISOString() } } }
      : null);
  if (!saved) return NextResponse.json({ error: "CHANGED", detail: "This booking just changed — please refresh and try again." }, { status: 409 });

  return NextResponse.json({
    order_id: order.orderId, amount: order.amount, currency: order.currency, key_id: order.keyId,
    name: "Bagdrop", description: `${kind === "topup" ? "Extra bags · " : ""}${b.id} · ${b.from} → ${b.to}`,
    prefill: { name: b.traveller.name, contact: b.traveller.mobile, email: b.traveller.email ?? "" },
  });
}
