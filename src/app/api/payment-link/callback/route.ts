import { NextResponse } from "next/server";
import { withBase } from "@/lib/basePath";
import { serviceClient } from "@/lib/supabaseAdmin";
import { fetchPaymentLink, razorpayConfigured, verifyPaymentLinkSignature } from "@/lib/razorpay";
import { confirmLinkPayment } from "@/lib/paymentLinks";
import { announcePayment } from "@/lib/automation";

/** Where Razorpay sends the customer back after paying a Payment Link.
 *  The query carries razorpay_payment_id, razorpay_payment_link_id,
 *  razorpay_payment_link_reference_id, razorpay_payment_link_status and
 *  razorpay_signature = HMAC-SHA256(link_id|reference_id|status|payment_id).
 *  The signature only proves the redirect came from Razorpay; the payment is
 *  then confirmed from Razorpay's own link + payment records before the
 *  booking is marked paid. The customer always lands on My bookings. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const back = (state: string, id?: string) => NextResponse.redirect(new URL(withBase(`/account?pay=${state}${id ? `&booking=${encodeURIComponent(id)}` : ""}`), url.origin), 303);

  const linkId = q("razorpay_payment_link_id"), paymentId = q("razorpay_payment_id");
  if (!razorpayConfigured() || !linkId || !paymentId) return back("error");
  if (!verifyPaymentLinkSignature(linkId, q("razorpay_payment_link_reference_id"), q("razorpay_payment_link_status"), paymentId, q("razorpay_signature"))) return back("error");

  const sb = serviceClient();
  if (!sb) return back("error");
  const bookingId = (await fetchPaymentLink(linkId).catch(() => null))?.notes?.bookingId;
  if (!bookingId) return back("error");

  const r = await confirmLinkPayment(sb, bookingId, linkId, "payment link");
  if (r.status === "applied") {
    await announcePayment(r.booking, { kind: r.kind, amount: r.amount, paymentId: r.paymentId, method: r.method, duplicate: r.duplicate, via: "payment link" });
    return back("paid", bookingId);
  }
  if (r.status === "already") return back("paid", bookingId);
  return back(r.status === "pending" ? "pending" : "error", bookingId);
}
