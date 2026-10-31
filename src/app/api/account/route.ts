import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { checkOtp } from "@/lib/otp";
import { quote, isChartPriced, inr } from "@/lib/pricing";
import { loadMasters } from "@/lib/pricingSettings";
import { quotePayload, sign } from "@/lib/sign";
import { istTomorrow } from "@/lib/services";
import { CLIENT_COOKIE, clientFromCookie, cookieOptions, identityFor, makeClientToken, ownsBooking, type ClientIdentity } from "@/lib/clientAuth";
import { clientView, decisionOf, loadPayConfig } from "@/lib/clientView";
import { isPaid } from "@/lib/payState";
import { claimOnce, kickSweep, opsNotify, notifyInquiryDesk } from "@/lib/automation";
import type { Booking } from "@/lib/types";
import { razorpayConfigured } from "@/lib/razorpay";
import { dropPaymentLink } from "@/lib/paymentLinks";

/** The client dashboard API. Every action except login requires the signed
 *  client session, and every booking action re-checks ownership server-
 *  side. Rules enforced HERE (not in the browser):
 *   · before payment is verified — bags/oversize/date may change; chart
 *     sectors re-price automatically, team-priced bookings go back to the
 *     team for a new price; the team is notified either way
 *   · after payment is verified — bags/oversize may only INCREASE (the extra
 *     amount becomes a top-up due); the date can't change; reductions and
 *     date changes go through the Bagdrop team
 *   · payment proof: image/PDF, ≤5 MB, content-sniffed, private storage. */

const BUCKET = "payment-proofs";
const MAX_BYTES = 5 * 1024 * 1024;

async function myBookings(sb: NonNullable<ReturnType<typeof serviceClient>>, id: ClientIdentity): Promise<Booking[]> {
  const { data } = await sb.from("bookings").select("doc").order("created", { ascending: false }).limit(1000);
  return (data ?? []).map((r) => r.doc as Booking).filter((b) => ownsBooking(id, b) && b.uc !== "wed");
}

/** Recompute a chart price for new counts; null = not on the chart. */
async function chartQuote(b: Booking, bags: number, oversize: number, date: string) {
  const masters = await loadMasters();
  const q = quote({ fromName: b.from, toName: b.to, bags, oversize, mode: b.mode, date }, masters);
  if (!isChartPriced(q)) return null;
  const qid = b.quote.qid ?? newToken("QT", 6);
  const validUntil = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const signature = sign(quotePayload({ qid, fromName: b.from, toName: b.to, bags, oversize, total: q.total, validUntil }));
  return { q, quote: { qid, total: q.total, breakdown: q, validUntil, signature } as Booking["quote"] };
}

function sniff(buf: Buffer): { ext: string; type: string } | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", type: "image/png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (buf.length > 5 && buf.toString("ascii", 0, 5) === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  return null;
}

async function save(sb: NonNullable<ReturnType<typeof serviceClient>>, b: Booking) {
  const up = await saveOrThrow(sb, b);
  if (up.error) throw new Error(up.error.message);
}

export async function GET(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const id = clientFromCookie(req.headers.get("cookie"));
  if (!id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const [list, pay] = await Promise.all([myBookings(sb, id), loadPayConfig()]);
  return NextResponse.json({
    identity: id.kind === "m" ? `+${id.value}` : id.value,
    bookings: list.map(clientView),
    payTo: { upiId: pay.upiId, payeeName: pay.payeeName, bankName: pay.bankName, accountName: pay.accountName, accountNo: pay.accountNo, ifsc: pay.ifsc, note: pay.note },
    /* online checkout (Razorpay) is offered only when the gateway keys are set */
    gateway: razorpayConfigured(),
  }, { headers: { "Cache-Control": "no-store" } });
}

async function handlePOST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const ctype = req.headers.get("content-type") ?? "";

  /* ================= payment proof upload (multipart) ================= */
  if (ctype.startsWith("multipart/form-data")) {
    const id = clientFromCookie(req.headers.get("cookie"));
    if (!id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const form = await req.formData();
    const bookingId = String(form.get("id") ?? "");
    const kind = form.get("kind") === "topup" ? "topup" : "full";
    const utr = String(form.get("utr") ?? "").trim().slice(0, 40);
    const file = form.get("file");
    if (!(file instanceof File) && !utr) return NextResponse.json({ error: "NEED_PROOF", detail: "Upload the payment screenshot or enter the UTR / transaction ID." }, { status: 400 });

    const { data } = await sb.from("bookings").select("doc").eq("id", bookingId).maybeSingle();
    if (!data || !ownsBooking(id, data.doc as Booking)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const b = data.doc as Booking;
    const v = clientView(b);
    if (!v.canPay) return NextResponse.json({ error: "NOT_PAYABLE", detail: "This booking isn't awaiting a payment right now." }, { status: 409 });
    if (kind === "full" && isPaid(b)) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 409 });
    if (kind === "full" && b.pay?.status === "submitted") return NextResponse.json({ error: "UNDER_VERIFICATION", detail: "Your payment proof is already with finance for verification." }, { status: 409 });
    if (kind === "topup" && !(b.pay?.topup && b.pay.topup.status !== "submitted")) return NextResponse.json({ error: "NO_TOPUP_DUE" }, { status: 409 });

    let proof: { path: string; name?: string; at: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "TOO_LARGE", detail: "Max 5 MB." }, { status: 413 });
      const buf = Buffer.from(await file.arrayBuffer());
      const t = sniff(buf);
      if (!t) return NextResponse.json({ error: "BAD_FILE", detail: "Only a PNG, JPG, WEBP image or a PDF is accepted." }, { status: 415 });
      await sb.storage.createBucket(BUCKET, { public: false }).catch(() => undefined); // exists already → ignored
      /* server-generated name — never the uploaded filename in the path */
      const path = `${b.id}/${kind}-${Date.now()}-${randomBytes(6).toString("hex")}.${t.ext}`;
      const upl = await sb.storage.from(BUCKET).upload(path, buf, { contentType: t.type, upsert: false });
      if (upl.error) return NextResponse.json({ error: "UPLOAD_FAILED", detail: upl.error.message }, { status: 500 });
      proof = { path, name: file.name.slice(0, 80), at: new Date().toISOString() };
    }

    const now = new Date().toISOString();
    let next: Booking;
    let amount: number;
    if (kind === "full") {
      amount = b.quote.total;
      next = {
        ...b,
        pay: { mode: "full", amount, status: "submitted", gateway: "UPI / bank transfer (manual)", at: now, utr: utr || undefined, proof, submittedAt: now, history: b.pay?.history },
        events: [...b.events, { at: now, by: "customer", text: `💳 Payment proof submitted for ${inr(amount)}${utr ? ` · UTR ${utr}` : ""}${proof ? " · screenshot uploaded" : ""} — awaiting finance verification` }],
      };
    } else {
      amount = b.pay!.topup!.amount;
      next = {
        ...b,
        pay: { ...b.pay!, topup: { ...b.pay!.topup!, status: "submitted", utr: utr || undefined, proof, submittedAt: now, rejectedNote: undefined } },
        events: [...b.events, { at: now, by: "customer", text: `💳 Extra-bags payment proof submitted for ${inr(amount)}${utr ? ` · UTR ${utr}` : ""} — awaiting finance verification` }],
      };
    }
    await save(sb, next);
    const msg = `💳 PAYMENT PROOF RECEIVED · ${b.id} · ${b.traveller.name} · ${inr(amount)}${kind === "topup" ? " (extra bags)" : ""}${utr ? ` · UTR ${utr}` : ""}${proof ? " · screenshot attached" : ""}\nVerify against the bank in BAGDROP OS → Finance → Payments to verify.`;
    await opsNotify(msg, `Payment proof · ${inr(amount)} · ${b.id}`, `proof:${b.id}:${kind}:${now}`);
    await notifyInquiryDesk(msg, `Payment proof to verify · ${b.id}`, `proofdesk:${b.id}:${kind}:${now}`);
    kickSweep();
    return NextResponse.json({ ok: true, booking: clientView(next) });
  }

  let body: { action?: string; otp?: { to?: string; code?: string; exp?: number; token?: string }; id?: string; bags?: number; oversize?: number; date?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  /* ================= login / logout ================= */
  if (body.action === "login") {
    const o = body.otp ?? {};
    if (!o.to || !o.code || !o.exp || !o.token || !checkOtp(o.to, o.code, Number(o.exp), o.token)) {
      return NextResponse.json({ error: "OTP_INVALID" }, { status: 401 });
    }
    if (!(await claimOnce(`otpuse:login:${o.token.slice(0, 40)}`))) return NextResponse.json({ error: "OTP_USED" }, { status: 409 });
    const ident = identityFor(o.to);
    if (!ident) return NextResponse.json({ error: "BAD_CONTACT" }, { status: 400 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(CLIENT_COOKIE, makeClientToken(ident), cookieOptions);
    return res;
  }
  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(CLIENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return res;
  }

  /* ================= edit bags / date ================= */
  if (body.action === "edit") {
    const id = clientFromCookie(req.headers.get("cookie"));
    if (!id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { data } = await sb.from("bookings").select("doc").eq("id", String(body.id ?? "")).maybeSingle();
    if (!data || !ownsBooking(id, data.doc as Booking)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const b = data.doc as Booking;
    const v = clientView(b);
    if (!v.canEdit) return NextResponse.json({ error: "NOT_EDITABLE", detail: b.pay?.status === "submitted" ? "Your payment is being verified — contact the Bagdrop team for changes." : "This booking can no longer be changed online — contact the Bagdrop team." }, { status: 409 });

    const bags = Math.min(50, Math.max(0, Math.floor(Number(body.bags ?? b.bags))));
    const oversize = Math.min(20, Math.max(0, Math.floor(Number(body.oversize ?? b.oversize))));
    const date = typeof body.date === "string" && body.date ? body.date : b.date;
    if (bags + oversize < 1) return NextResponse.json({ error: "NO_BAGS" }, { status: 400 });
    if (bags === b.bags && oversize === b.oversize && date === b.date) return NextResponse.json({ ok: true, booking: v });
    const now = new Date().toISOString();
    const change = `bags ${b.bags}→${bags}${oversize !== b.oversize ? `, oversize ${b.oversize}→${oversize}` : ""}${date !== b.date ? `, date ${b.date}→${date}` : ""}`;

    if (isPaid(b)) {
      /* after payment: only ADD bags; no date change, no reductions */
      if (date !== b.date) return NextResponse.json({ error: "DATE_LOCKED", detail: "After payment the date can only be changed by the Bagdrop team." }, { status: 409 });
      if (bags < b.bags || oversize < b.oversize) return NextResponse.json({ error: "NO_REDUCTION", detail: "After payment bags can't be reduced online — contact the Bagdrop team." }, { status: 409 });
      if (b.pay?.topup?.status === "submitted") return NextResponse.json({ error: "TOPUP_PENDING", detail: "Your last extra payment is being verified — please wait." }, { status: 409 });
      const cq = await chartQuote(b, bags, oversize, b.date);
      if (!cq) {
        /* team-priced booking: the team prices the extra bags */
        const next: Booking = { ...b, admin: { ...b.admin, bagAddRequest: { bags, oversize, at: now } }, events: [...b.events, { at: now, by: "customer", text: `Client asked to ADD bags after payment (${change}) — needs a price from the team` }] };
        await save(sb, next);
        await opsNotify(`➕ Bags added after payment · ${b.id} · ${change} · team-priced route — set the extra amount.`, `Bag add request · ${b.id}`, `bagadd:${b.id}:${now}`);
        return NextResponse.json({ ok: true, booking: clientView(next), note: "The Bagdrop team will confirm the extra amount shortly." });
      }
      const extra = Math.max(0, cq.q.total - b.pay!.amount);
      const next: Booking = {
        ...b, bags, oversize, billed: cq.q.billed, quote: cq.quote,
        pay: { ...b.pay!, topup: extra > 0 ? { amount: extra, status: "due", submittedAt: null } : null },
        events: [...b.events, { at: now, by: "customer", text: `Client ADDED bags after payment (${change}) · extra ${inr(extra)} due` }],
      };
      await save(sb, next);
      await opsNotify(`➕ Bags added after payment · ${b.id} · ${change} · extra ${inr(extra)} due from the client.`, `Bags added · ${b.id}`, `bagadd:${b.id}:${now}`);
      kickSweep();
      return NextResponse.json({ ok: true, booking: clientView(next) });
    }

    /* before payment: bags and date may change */
    if (date !== b.date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < istTomorrow())) return NextResponse.json({ error: "BAD_DATE", detail: "Pickup needs at least 24 hours' notice." }, { status: 400 });
    const cq = await chartQuote(b, bags, oversize, date);
    const wasApproved = decisionOf(b).state === "approved";
    let next: Booking;
    if (cq) {
      next = { ...b, bags, oversize, date, pickupDate: date, billed: cq.q.billed, quote: cq.quote, events: [...b.events, { at: now, by: "customer", text: `Client changed the booking (${change}) · re-priced from the rate chart: ${inr(cq.q.total)}` }] };
    } else {
      /* team-priced: back to the team for a fresh price + approval */
      next = {
        ...b, bags, oversize, date, pickupDate: date, status: "submitted",
        quote: { qid: null, total: 0, breakdown: { ror: true } },
        admin: { ...b.admin, decision: { state: "pending", at: now, note: "client changed bags/date — needs re-pricing" } },
        events: [...b.events, { at: now, by: "customer", text: `Client changed the booking (${change}) · team-priced route — sent back for a new price` }],
      };
    }
    await save(sb, next);
    await dropPaymentLink(sb, next); /* the old amount's link must not be paid any more */
    await opsNotify(`✏️ Client changed ${b.id} · ${change}${cq ? ` · new chart price ${inr(cq.q.total)}${wasApproved ? " (booking stays approved — payment link shows the new amount)" : ""}` : " · needs re-pricing + approval"}`, `Booking changed · ${b.id}`, `edit:${b.id}:${now}`);
    kickSweep();
    return NextResponse.json({ ok: true, booking: clientView(next) });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}

export const POST = retryOnConflict(handlePOST);
