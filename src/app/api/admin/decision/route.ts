import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { quotePayload, sign } from "@/lib/sign";
import { inr } from "@/lib/pricing";
import { loadPayConfig, decisionOf } from "@/lib/clientView";
import { isPaid } from "@/lib/payState";
import { notify, kickSweep } from "@/lib/automation";
import { dropPaymentLink, ensurePaymentLink } from "@/lib/paymentLinks";
import type { Booking } from "@/lib/types";

/** Staff decision on a booking request — the gate between "inquiry" and
 *  "payable". Every decision is stamped (decision + history + event log)
 *  and the client is told by WhatsApp + email.
 *   approve  → payable (optionally at a price set here — required for an
 *              inquiry that has no chart price); payment details go out
 *   revise   → new price, client informed, still awaiting approval
 *   hold     → paused with a reason the client sees
 *   info     → a question to the client
 *   reject   → closed, with the reason */

type Body = { id?: string; decision?: "approve" | "revise" | "hold" | "info" | "reject"; note?: string; total?: number };

async function handlePOST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.decision) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const doc = data.doc as Booking;
  if (isPaid(doc)) return NextResponse.json({ error: "ALREADY_PAID", detail: "Payment is verified — decisions are closed; use Shipments for operations." }, { status: 409 });
  if (["picked_up", "in_transit", "delivered"].includes(doc.status)) return NextResponse.json({ error: "IN_MOTION" }, { status: 409 });

  const note = (b.note ?? "").trim().slice(0, 400);
  const now = new Date().toISOString();
  const origin = new URL(req.url).origin;
  const total = Math.round(Number(b.total) || 0);
  const hasPrice = !doc.quote.breakdown?.ror && doc.quote.total > 0;

  /* a fresh signed price (manual) when staff set one */
  const signedManual = (amount: number): Booking["quote"] => {
    const qid = doc.quote.qid ?? newToken("QT", 6);
    const validUntil = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const signature = sign(quotePayload({ qid, fromName: doc.from, toName: doc.to, bags: doc.bags, oversize: doc.oversize, total: amount, validUntil }));
    return { qid, total: amount, breakdown: { total: amount, gst: Math.round(amount - amount / 1.05), rule: "team price (manual)" }, validUntil, signature };
  };

  let next: Booking = { ...doc };
  let template: string;
  let state: "approved" | "rejected" | "hold" | "info" | "pending";
  let text: string;

  switch (b.decision) {
    case "approve": {
      if (total > 0) next.quote = signedManual(total);
      else if (!hasPrice) return NextResponse.json({ error: "NEEDS_PRICE", detail: "This is an inquiry with no chart price — enter the amount to approve at." }, { status: 400 });
      next.status = "accepted"; state = "approved"; template = "booking_approved";
      text = `✅ Booking APPROVED by the team at ${inr(next.quote.total)}${note ? ` · ${note}` : ""} — payment details sent to the client`;
      break;
    }
    case "revise": {
      if (total <= 0) return NextResponse.json({ error: "NEEDS_PRICE" }, { status: 400 });
      next.quote = signedManual(total); next.status = "revised"; state = "pending"; template = "quote_revised";
      text = `💬 Price revised by the team to ${inr(total)}${note ? ` · ${note}` : ""} — awaiting approval`;
      break;
    }
    case "hold": {
      if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Give the client a reason for the hold." }, { status: 400 });
      state = "hold"; template = "booking_on_hold";
      text = `⏸ Booking put ON HOLD by the team · ${note}`;
      break;
    }
    case "info": {
      if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Write the question for the client." }, { status: 400 });
      state = "info"; template = "booking_info_needed";
      text = `❓ Team asked the client for more information · ${note}`;
      break;
    }
    case "reject": {
      if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Give the client the reason." }, { status: 400 });
      next.status = "rejected"; state = "rejected"; template = "booking_rejected";
      text = `✖ Booking REJECTED by the team · ${note}`;
      break;
    }
    default:
      return NextResponse.json({ error: "BAD_DECISION" }, { status: 400 });
  }

  const prev = decisionOf(doc);
  const history = [...(((doc.admin as { decisions?: unknown[] }).decisions) ?? []), { state, note, at: now, from: prev.state }];
  next = {
    ...next,
    admin: { ...doc.admin, decision: { state, note: note || undefined, at: now }, decisions: history },
    events: [...doc.events, { at: now, by: "admin", text }],
  };
  const up = await saveOrThrow(sb, next);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  /* online: the approval carries a Razorpay payment link for the amount due;
   * any other decision cancels a link that is no longer valid */
  let paylink = "";
  if (state === "approved") {
    const l = await ensurePaymentLink(sb, doc.id, origin);
    if (!("error" in l)) paylink = l.url;
  } else await dropPaymentLink(sb, next);

  const pay = await loadPayConfig();
  const bank = pay.accountNo ? `${pay.accountName ?? pay.payeeName ?? "Bagdrop"} · ${pay.bankName ?? ""} · A/c ${pay.accountNo}${pay.ifsc ? ` · IFSC ${pay.ifsc}` : ""}` : "";
  await notify(template, { name: doc.traveller.name, mobile: doc.traveller.mobile, email: doc.traveller.email }, {
    ref: doc.id, lane: `${doc.from} → ${doc.to}`, amount: inr(next.quote.total), note,
    upi: pay.upiId ?? "the UPI ID on your dashboard", bank,
    dashboard: `${origin}/account`, link: `${origin}/q/${doc.id}`, paylink,
  }, `decision:${doc.id}:${state}:${now}`);
  kickSweep();
  return NextResponse.json({ ok: true, booking: next });
}

export const POST = retryOnConflict(handlePOST);
