import { NextResponse } from "next/server";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { checkOtp, cleanEmail, cleanMobile } from "@/lib/otp";
import { quote, isChartPriced, cityByName, inr, routeFor } from "@/lib/pricing";
import { decideInstant } from "@/lib/instantServer";
import { ensurePaymentLink } from "@/lib/paymentLinks";
import { loadMasters } from "@/lib/pricingSettings";
import { quotePayload, sign } from "@/lib/sign";
import { SERVICES, istTomorrow } from "@/lib/services";
import { CLIENT_COOKIE, cookieOptions, identityFor, makeClientToken } from "@/lib/clientAuth";
import { claimOnce, kickSweep, notifyInquiryDesk } from "@/lib/automation";
import { clientView, loadPayConfig } from "@/lib/clientView";
import type { Booking } from "@/lib/types";

/** The ONLY way a homepage booking enters the system.
 *  1. The OTP proof is checked server-side and can be used exactly once.
 *  2. Only whitelisted fields are read; everything else is server-decided
 *     (status, payment, identity, admin, quote) — the browser cannot set them.
 *  3. Price comes from the SECTOR RATE CHART only. A lane the chart doesn't
 *     list becomes an inquiry with no price shown.
 *  4. The inquiry desk (info@ + aditya@) and the ops contact are alerted.
 *  5. The verified contact becomes the client's dashboard session. */

/** Public read for the shared payment link (/q/<id>): the customer-safe
 *  projection only — the booking id is the bearer key. */
export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(id)) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const doc = data.doc as Booking;
  const pay = await loadPayConfig();
  return NextResponse.json({
    booking: { ...clientView(doc), name: doc.traveller.name.split(" ")[0] },
    payTo: { upiId: pay.upiId, payeeName: pay.payeeName, bankName: pay.bankName, accountName: pay.accountName, accountNo: pay.accountNo, ifsc: pay.ifsc, note: pay.note },
  }, { headers: { "Cache-Control": "no-store" } });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(Number(v) || 0)));

export async function POST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { draft?: Record<string, unknown>; otp?: { to?: string; code?: string; exp?: number; token?: string; channel?: string } };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const d = b.draft ?? {};
  const o = b.otp ?? {};

  /* ---- 1 · OTP proof ---- */
  if (!o.to || !o.code || !o.exp || !o.token || !checkOtp(o.to, o.code, Number(o.exp), o.token)) {
    return NextResponse.json({ error: "OTP_INVALID", detail: "Your verification code has expired — please verify again." }, { status: 401 });
  }
  const mobile = cleanMobile(str(d.mobile, 20));
  const email = str(d.email, 120) ? cleanEmail(str(d.email, 120)) : null;
  if (!mobile) return NextResponse.json({ error: "BAD_MOBILE" }, { status: 400 });
  if (str(d.email, 120) && !email) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
  /* the verified destination must be THIS booking's mobile or email */
  if (o.to !== mobile && o.to !== email) return NextResponse.json({ error: "OTP_MISMATCH", detail: "The verified contact doesn't match the booking contact." }, { status: 401 });

  /* ---- 2 · whitelisted fields ---- */
  const svc = SERVICES.find((s) => s.uc === d.uc);
  if (!svc) return NextResponse.json({ error: "BAD_SERVICE" }, { status: 400 });
  const name = str(d.name, 80);
  const fromName = str(d.fromName, 60), toName = str(d.toName, 60);
  const pickAddr = str(d.pickAddr, 200), dropAddr = str(d.dropAddr, 200);
  const date = str(d.date, 10);
  const bags = int(d.bags, 0, 50), oversize = int(d.oversize, 0, 20);
  if (name.length < 2 || !fromName || !toName) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  if (fromName.toLowerCase() === toName.toLowerCase()) return NextResponse.json({ error: "SAME_CITY", detail: "Pickup and delivery cities must be different." }, { status: 400 });
  if (bags + oversize < 1) return NextResponse.json({ error: "NO_BAGS" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < istTomorrow()) return NextResponse.json({ error: "BAD_DATE", detail: "Pickup needs at least 24 hours' notice." }, { status: 400 });
  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(str(d.deliveryDate, 10)) && str(d.deliveryDate, 10) >= date ? str(d.deliveryDate, 10) : null;

  /* one booking per OTP proof — a replayed proof can't spam bookings */
  if (!(await claimOnce(`otpuse:book:${o.token.slice(0, 40)}`))) {
    return NextResponse.json({ error: "OTP_USED", detail: "This code was already used — verify again to make another booking." }, { status: 409 });
  }

  /* ---- 3 · price from the sector rate chart only ---- */
  const masters = await loadMasters();
  const q = quote({ fromName, toName, bags, oversize, mode: svc.mode, date }, masters);
  const priced = isChartPriced(q);
  const now = new Date().toISOString();
  let bookingQuote: Booking["quote"] = { qid: null, total: 0, breakdown: { ror: true } };
  if (priced) {
    const qid = newToken("QT", 6);
    const validUntil = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const signature = sign(quotePayload({ qid, fromName, toName, bags, oversize, total: q.total, validUntil }));
    bookingQuote = { qid, total: q.total, breakdown: q, validUntil, signature };
  }

  /* ---- 3b · instant booking: chart route switched on + date/notice/bags/capacity ---- */
  const pickupDay = str(d.pickupDate, 10) || date;
  const route = priced ? routeFor(fromName, toName, masters.routes) : undefined;
  const inst = priced ? await decideInstant(sb, route, { date: pickupDay, bags, oversize }) : null;
  const instant = inst?.result.ok ? { at: now, holdUntil: new Date(Date.now() + inst.defaults.holdMinutes * 60_000).toISOString(), holdMinutes: inst.defaults.holdMinutes } : null;
  const instantMiss = inst && !inst.result.ok ? { code: inst.result.code, reason: inst.result.reason } : null;

  const fc = cityByName(fromName, masters.cities), tc = cityByName(toName, masters.cities);
  const id = newToken("BD");
  const doc: Booking = {
    id, created: now, status: instant ? "accepted" : "submitted",
    uc: svc.uc, ucName: svc.title, mode: svc.mode,
    from: fromName, to: toName, pickAddr, dropAddr,
    zo: fc?.zone ?? "", zd: tc?.zone ?? "",
    date, pickupDate: str(d.pickupDate, 10) || date, deliveryDate,
    flightTime: str(d.flightTime, 5) || null, ref: str(d.flight, 20).toUpperCase(), slot: str(d.slot, 40),
    bags, oversize, billed: priced ? q.billed : Math.max(bags + oversize, 1),
    traveller: { name, mobile, email: email ?? "", res: "in" },
    payer: null, note: str(d.note, 300), source: "website",
    quote: bookingQuote,
    identity: { ok: false, at: "", method: "Pending — after payment verification", score: 0 },
    indemnity: null,
    pay: null,
    admin: {
      decision: instant ? { state: "approved", at: now, by: "instant", note: "Instant booking — auto-approved (route open for instant booking)" } : { state: "pending", at: now },
      otpChannel: o.channel === "email" ? "email" : "mobile",
      ...(instant ? { instant } : {}), ...(instantMiss ? { instantMiss } : {}),
    },
    events: [
      { at: now, by: "customer", text: `Booking request submitted on the website · contact verified by ${o.channel === "email" ? "email" : "mobile"} OTP` },
      { at: now, by: "customer", text: priced ? `Price shown on screen: ${inr(q.total)} (sector rate chart, GST 5% incl.) · ${instant ? "instant booking" : "awaiting team approval"}` : "New sector — not on the rate chart · sent to the team as an inquiry (no price shown)" },
      ...(instant ? [{ at: now, by: "admin" as const, text: `⚡ INSTANT booking — auto-approved; confirmed the moment it is paid. Held for ${instant.holdMinutes} minutes, then it goes to the team for approval.` }] : []),
      ...(instantMiss ? [{ at: now, by: "admin" as const, text: `Not instant (${instantMiss.code}): ${instantMiss.reason} — needs team approval` }] : []),
    ],
  };
  const up = await sb.from("bookings").insert({ id: doc.id, doc, status: doc.status, created: doc.created });
  if (up.error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });

  /* ---- 4 · alert the inquiry desk + ops ---- */
  const summary = `${instant ? "⚡ New INSTANT booking (auto-approved, awaiting payment)" : priced ? "🧳 New booking request" : "📥 New SECTOR inquiry (not on rate chart)"} · ${id}\n${name} · +${mobile}${email ? ` · ${email}` : ""}\n${svc.title} · ${fromName} → ${toName} · ${bags} bag(s)${oversize ? ` + ${oversize} oversize` : ""} · pickup ${date}${str(d.slot, 40) ? ` ${str(d.slot, 40)}` : ""}\n${priced ? `Chart price shown: ${inr(q.total)}` : "No price shown — needs a rate"}\n${instant ? "Confirms itself when paid — no decision needed." : "Review and decide in BAGDROP OS → Shipments."}`;
  await notifyInquiryDesk(summary, `${instant ? "Instant booking" : priced ? "New booking request" : "New sector inquiry"} · ${id} · ${fromName} → ${toName}`, `inq:${id}`);
  /* instant: a payment link too, so the WhatsApp/email acknowledgement can carry it */
  if (instant) {
    const l = await ensurePaymentLink(sb, id, new URL(req.url).origin).catch((e) => ({ error: "EXCEPTION", detail: String(e) }));
    /* not fatal: the customer can pay in the booking form / My bookings, and
     * the sweep retries the link before the WhatsApp acknowledgement */
    if ("error" in l) console.error(`[instant] payment link not created for ${id}: ${l.error} ${l.detail ?? ""}`);
  }
  /* the sweep's capture pass sends the ops alert + customer acknowledgement */
  kickSweep();

  /* ---- 5 · the verified contact opens the client dashboard ---- */
  const res = NextResponse.json({
    ok: true, id, priced,
    instant: instant ? { holdUntil: instant.holdUntil, holdMinutes: instant.holdMinutes } : null,
    instantReason: instantMiss?.reason ?? null,
    price: priced ? { total: q.total, base: q.base, oversize: q.oversize, gst: q.gst, billed: q.billed, rule: q.rule, validUntil: bookingQuote.validUntil } : null,
  });
  const ident = identityFor(o.to);
  if (ident) res.cookies.set(CLIENT_COOKIE, makeClientToken(ident), cookieOptions);
  return res;
}
