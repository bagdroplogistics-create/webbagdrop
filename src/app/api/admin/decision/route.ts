import { retryOnConflict, revOf, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { actorCan, actorName, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { quotePayload, sign } from "@/lib/sign";
import { inr, isChartPriced, quote } from "@/lib/pricing";
import { loadMasters } from "@/lib/pricingSettings";
import { loadPayConfig, decisionOf } from "@/lib/clientView";
import { isHostBilled, isPaid } from "@/lib/payState";
import { notify, kickSweep } from "@/lib/automation";
import { dropPaymentLink, ensurePaymentLink } from "@/lib/paymentLinks";
import { applyInquiryChanges, type InquiryChanges } from "@/lib/inquiryEdit";
import type { Booking } from "@/lib/types";

/** Staff decision on a booking request — the gate between "inquiry" and
 *  "payable". Every decision is stamped (decision + history + event log)
 *  and the client is told by WhatsApp + email.
 *   approve  → payable (optionally at a price set here — required for an
 *              inquiry that has no chart price); payment details go out
 *   revise   → new price, client informed, still awaiting approval
 *   hold     → paused with a reason the client sees
 *   info     → a question to the client
 *   reject   → closed, with the reason
 *
 *  The quote desk may send `changes` (corrected details) with any decision;
 *  they are applied and re-priced first (lib/inquiryEdit.ts) and saved in
 *  the same compare-and-swap write, so an edit and its decision can never
 *  land apart. Changes need Edit on Shipments; hold / ask / reject may not
 *  move the price, because those messages don't tell the customer one. */

type Body = { id?: string; decision?: "approve" | "revise" | "hold" | "info" | "reject"; note?: string; total?: number; changes?: InquiryChanges; rev?: number };

async function handlePOST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.decision) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  let doc = data.doc as Booking;
  /* the quote desk sends the revision it loaded: never decide on a copy someone has since changed */
  if (typeof b.rev === "number" && revOf(doc) !== b.rev) return NextResponse.json({ error: "STALE", detail: "This inquiry changed since you opened it (the customer, finance or another team member updated it). Load the latest copy and try again." }, { status: 409 });
  if (isPaid(doc)) return NextResponse.json({ error: "ALREADY_PAID", detail: "Payment is verified — decisions are closed; use Shipments for operations." }, { status: 409 });
  if (["picked_up", "in_transit", "delivered"].includes(doc.status)) return NextResponse.json({ error: "IN_MOTION" }, { status: 409 });

  const note = (b.note ?? "").trim().slice(0, 400);
  const now = new Date().toISOString();

  /* corrected details from the quote desk, applied before deciding */
  if (b.changes && typeof b.changes === "object" && Object.keys(b.changes).length) {
    if (!(await actorCan("ship.edit"))) return NextResponse.json({ error: "FORBIDDEN", detail: "Changing booking details needs Edit on Shipments." }, { status: 403 });
    const r = applyInquiryChanges(doc, b.changes, await loadMasters());
    if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.error === "LOCKED" ? 409 : 400 });
    if (r.priceChanged && ["hold", "info", "reject"].includes(b.decision)) {
      return NextResponse.json({ error: "PRICE_WOULD_CHANGE", detail: "These changes change the price — use Accept or Send revised price so the customer is told the new amount." }, { status: 409 });
    }
    if (r.changed.length) doc = { ...r.next, events: [...r.next.events, { at: now, by: "admin", text: `Details corrected by ${await actorName()} · ${r.changed.join("; ")}` }] };
  }
  const origin = new URL(req.url).origin;
  const total = Math.round(Number(b.total) || 0);
  const hasPrice = !doc.quote.breakdown?.ror && doc.quote.total > 0;
  const hosted = isHostBilled(doc);

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
      if (hosted) {
        // hosts pay: confirm with no price and no payment link; the sweep sends the family their confirmation
        next.status = "accepted"; state = "approved"; template = "";
        text = `Booking CONFIRMED by the team · billed to the hosts${note ? ` · ${note}` : ""}`;
        break;
      }
      if (total > 0) next.quote = signedManual(total);
      else if (!hasPrice) return NextResponse.json({ error: "NEEDS_PRICE", detail: "This is an inquiry with no chart price — enter the amount to approve at." }, { status: 400 });
      else if (doc.quote.validUntil && Date.parse(doc.quote.validUntil) < Date.now() && doc.quote.breakdown?.rule !== "team price (manual)") {
        /* price lock: a quote is honoured until it expires; approving after that re-prices on today's chart */
        const q = quote({ fromName: doc.from, toName: doc.to, bags: doc.bags, oversize: doc.oversize, mode: doc.mode, date: doc.date }, await loadMasters());
        if (!isChartPriced(q)) return NextResponse.json({ error: "NEEDS_PRICE", detail: "The quoted price has expired and this lane is no longer on the rate chart — enter the amount to approve at." }, { status: 400 });
        const qid = newToken("QT", 6), validUntil = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
        next.quote = { qid, total: q.total, breakdown: q, validUntil, signature: sign(quotePayload({ qid, fromName: doc.from, toName: doc.to, bags: doc.bags, oversize: doc.oversize, total: q.total, validUntil })) };
        next.events = [...next.events, { at: now, by: "admin", text: `Quoted price ${inr(doc.quote.total)} had expired — re-priced on today's chart at ${inr(q.total)} (held 72 hours)` }];
      }
      next.status = "accepted"; state = "approved"; template = "booking_approved";
      text = `Booking APPROVED by the team at ${inr(next.quote.total)}${note ? ` · ${note}` : ""} — payment details sent to the client`;
      break;
    }
    case "revise": {
      if (total <= 0) return NextResponse.json({ error: "NEEDS_PRICE" }, { status: 400 });
      next.quote = signedManual(total); next.status = "revised"; state = "pending"; template = "quote_revised";
      text = `Price revised by the team to ${inr(total)}${note ? ` · ${note}` : ""} — awaiting approval`;
      break;
    }
    case "hold": {
      if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Give the client a reason for the hold." }, { status: 400 });
      state = "hold"; template = "booking_on_hold";
      text = `Booking put ON HOLD by the team · ${note}`;
      break;
    }
    case "info": {
      if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Write the question for the client." }, { status: 400 });
      state = "info"; template = "booking_info_needed";
      text = `Team asked the client for more information · ${note}`;
      break;
    }
    case "reject": {
      if (!note) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Give the client the reason." }, { status: 400 });
      next.status = "rejected"; state = "rejected"; template = "booking_rejected";
      text = `Booking REJECTED by the team · ${note}`;
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
    events: [...next.events, { at: now, by: "admin", text: `${text} · by ${await actorName()}` }],
  };
  const up = await saveOrThrow(sb, next);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  /* online: the approval carries a Razorpay payment link for the amount due;
   * any other decision cancels a link that is no longer valid */
  let paylink = "";
  if (state === "approved" && !hosted) {
    const l = await ensurePaymentLink(sb, doc.id, origin);
    if (!("error" in l)) paylink = l.url;
  } else await dropPaymentLink(sb, next);

  const pay = await loadPayConfig();
  const bank = pay.accountNo ? `${pay.accountName ?? pay.payeeName ?? "Bagdrop"} · ${pay.bankName ?? ""} · A/c ${pay.accountNo}${pay.ifsc ? ` · IFSC ${pay.ifsc}` : ""}` : "";
  if (template) await notify(template, { name: doc.traveller.name, mobile: doc.traveller.mobile, email: doc.traveller.email }, {
    ref: doc.id, lane: `${doc.from} → ${doc.to}`, amount: inr(next.quote.total), note,
    upi: pay.upiId ?? "the UPI ID on your dashboard", bank,
    dashboard: `${origin}/account`, link: `${origin}/q/${doc.id}`, paylink,
  }, `decision:${doc.id}:${state}:${now}`);
  kickSweep();
  return NextResponse.json({ ok: true, booking: next });
}

export const POST = retryOnConflict(handlePOST);
