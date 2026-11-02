/** Payment gateway (Razorpay) reconciliation — server-only.
 *
 *  Three-way check, every day and on demand:
 *    1. Razorpay → bookings: every captured payment belongs to a booking that
 *       records it, at the same amount; every refund is tied to a booking.
 *    2. Bookings → Razorpay: every booking marked paid online has a captured
 *       payment in Razorpay.
 *    3. Razorpay → bank: every settlement (payments − fees − GST on fees −
 *       refunds) arrives in the bank statement (Finance → Bank, matched by
 *       UTR, else by amount within 3 days).
 *  Sources: the Razorpay API (payments, refunds, settlements, settlement
 *  recon) or, as a fallback, a Razorpay CSV report. Results and the team's
 *  "resolved" notes live in settings row "gateway_recon". Nothing here
 *  changes a booking or money — it only reports. */
import type { Booking } from "./types";
import { razorpayConfigured } from "./razorpay";
import type { serviceClient } from "./supabaseAdmin";
import { istToday } from "@/lib/services";

type SB = NonNullable<ReturnType<typeof serviceClient>>;

export interface GwPayment { id: string; amount: number; fee: number; tax: number; status: string; method: string; at: string; orderId?: string; notes?: Record<string, string>; description?: string; refunded: number; settlementId?: string }
export interface GwRefund { id: string; paymentId: string; amount: number; status: string; at: string }
export interface GwSettlement { id: string; amount: number; fees: number; tax: number; utr: string; status: string; at: string }
export type IssueKind = "orphan_payment" | "not_in_gateway" | "amount_mismatch" | "gateway_not_captured" | "duplicate_payment" | "refund_no_booking" | "settlement_not_in_bank" | "settlement_short";
export interface ReconIssue { key: string; kind: IssueKind; severity: "high" | "medium" | "low"; text: string; ref: string; amount: number; bookingId?: string }
export interface ReconRow extends GwPayment { bookingId: string | null; bookingAmount: number | null; match: "ok" | "no_booking" | "amount_mismatch" | "not_captured" }
export interface SettlementRow extends GwSettlement { bank: { rowId: string; date: string; how: "utr" | "amount" } | null; expected: number | null }
export interface ReconResult {
  runAt: string; from: string; to: string; source: "api" | "csv"; error?: string;
  payments: ReconRow[]; refunds: (GwRefund & { bookingId: string | null })[]; settlements: SettlementRow[];
  issues: ReconIssue[];
  totals: { captured: number; count: number; fees: number; tax: number; refunds: number; net: number; settled: number; unsettled: number };
}
export interface ReconDoc { last: ReconResult | null; resolved: Record<string, { at: string; note: string }>; rev?: number }

const rupees = (paise: number) => Math.round(paise) / 100;
const iso = (unix: number) => new Date(unix * 1000).toISOString();
const BOOKING_ID = /\b(BD-\d{4}-[A-Z0-9]{6,})\b/;
const auth = () => "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");

async function rzp<T>(path: string): Promise<T> {
  const r = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { Authorization: auth() } });
  if (!r.ok) throw new Error(`Razorpay ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json() as Promise<T>;
}
/** All items of a Razorpay collection in a time window (100 per page, capped). */
async function all<T>(path: string, from: number, to: number, cap = 2000): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0; skip < cap; skip += 100) {
    const j = await rzp<{ items: T[] }>(`${path}?from=${from}&to=${to}&count=100&skip=${skip}`);
    out.push(...j.items);
    if (j.items.length < 100) break;
  }
  return out;
}

type RawPayment = { id: string; amount: number; fee?: number; tax?: number; status: string; method?: string; created_at: number; order_id?: string; notes?: Record<string, string> | []; description?: string; amount_refunded?: number };
type RawRefund = { id: string; payment_id: string; amount: number; status: string; created_at: number };
type RawSettlement = { id: string; amount: number; fees?: number; tax?: number; utr?: string; status: string; created_at: number };
type RawRecon = { entity_id: string; type: string; settlement_id?: string; payment_id?: string };

/** Pull the window from the Razorpay API. */
export async function fetchGateway(fromDay: string, toDay: string): Promise<{ payments: GwPayment[]; refunds: GwRefund[]; settlements: GwSettlement[] }> {
  const from = Math.floor(Date.parse(`${fromDay}T00:00:00+05:30`) / 1000), to = Math.floor(Date.parse(`${toDay}T23:59:59+05:30`) / 1000);
  const [p, r, s] = await Promise.all([all<RawPayment>("payments", from, to), all<RawRefund>("refunds", from, to), all<RawSettlement>("settlements", from, to)]);
  /* which settlement each payment went out in (settlement recon, one call per day, capped at 35 days) */
  const settledIn = new Map<string, string>();
  const days = Math.min(35, Math.round((to - from) / 86400) + 1);
  for (let d = 0; d < days && s.length; d++) {
    const day = new Date((from + d * 86400) * 1000 + 5.5 * 3600e3);
    const rec = await rzp<{ items: RawRecon[] }>(`settlements/recon/combined?year=${day.getUTCFullYear()}&month=${day.getUTCMonth() + 1}&day=${day.getUTCDate()}&count=1000`).catch(() => ({ items: [] as RawRecon[] }));
    for (const x of rec.items) if (x.type === "payment" && x.settlement_id) settledIn.set(x.entity_id, x.settlement_id);
  }
  return {
    payments: p.map((x) => ({
      id: x.id, amount: rupees(x.amount), fee: rupees(x.fee ?? 0), tax: rupees(x.tax ?? 0), status: x.status, method: x.method ?? "", at: iso(x.created_at),
      orderId: x.order_id, notes: Array.isArray(x.notes) ? {} : x.notes ?? {}, description: x.description, refunded: rupees(x.amount_refunded ?? 0), settlementId: settledIn.get(x.id),
    })),
    refunds: r.map((x) => ({ id: x.id, paymentId: x.payment_id, amount: rupees(x.amount), status: x.status, at: iso(x.created_at) })),
    settlements: s.map((x) => ({ id: x.id, amount: rupees(x.amount), fees: rupees(x.fees ?? 0), tax: rupees(x.tax ?? 0), utr: x.utr ?? "", status: x.status, at: iso(x.created_at) })),
  };
}

/* ---------------- CSV fallback (Razorpay dashboard reports) ---------------- */
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((x) => x.trim());
}
const csvDate = (s: string) => { const t = Date.parse(s.includes("T") || s.includes("-") ? s.replace(" ", "T") : s); return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(); };
const money = (s: string | undefined) => Number((s ?? "").replace(/[₹,\s]/g, "")) || 0;

/** A Razorpay "Settlement recon" report (entity_id, type, amount, fee, tax, settlement_id, settlement_utr …)
 *  or a "Payments" export (id, amount, status, fee, tax, order_id …). Amounts in rupees. */
export function parseGatewayCsv(text: string): { payments: GwPayment[]; refunds: GwRefund[]; settlements: GwSettlement[]; kind: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The file has no rows.");
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const at = (k: string) => head.indexOf(k);
  const rows = lines.slice(1).map(splitCsv).map((c) => (k: string) => (at(k) >= 0 ? c[at(k)] ?? "" : ""));
  const payments: GwPayment[] = [], refunds: GwRefund[] = [];
  const settleMap = new Map<string, GwSettlement>();
  if (at("entity_id") >= 0 && at("type") >= 0) {
    for (const g of rows) {
      const type = g("type").toLowerCase(), sid = g("settlement_id");
      if (type === "payment") payments.push({ id: g("entity_id"), amount: money(g("amount")), fee: money(g("fee")), tax: money(g("tax")), status: "captured", method: g("method"), at: csvDate(g("created_at")), orderId: g("order_id") || undefined, description: g("description"), notes: { bookingId: (g("notes").match(BOOKING_ID) ?? [])[1] ?? (g("order_receipt").match(BOOKING_ID) ?? [])[1] ?? "" }, refunded: 0, settlementId: sid || undefined });
      else if (type === "refund") refunds.push({ id: g("entity_id"), paymentId: g("payment_id"), amount: money(g("amount")), status: "processed", at: csvDate(g("created_at")) });
      if (sid && (type === "payment" || type === "refund")) {
        const s = settleMap.get(sid) ?? { id: sid, amount: 0, fees: 0, tax: 0, utr: g("settlement_utr"), status: g("settled").toLowerCase() === "1" || g("settled").toLowerCase() === "true" ? "processed" : "created", at: csvDate(g("settled_at") || g("created_at")) };
        s.amount += money(g("credit")) - money(g("debit")) || (type === "payment" ? money(g("amount")) - money(g("fee")) : -money(g("amount")));
        s.fees += money(g("fee")) - money(g("tax")); s.tax += money(g("tax"));
        settleMap.set(sid, s);
      }
    }
    return { payments, refunds, settlements: [...settleMap.values()].map((s) => ({ ...s, amount: Math.round(s.amount * 100) / 100 })), kind: "settlement recon report" };
  }
  if (at("id") >= 0 && at("amount") >= 0 && at("status") >= 0) {
    for (const g of rows) payments.push({ id: g("id"), amount: money(g("amount")), fee: money(g("fee")), tax: money(g("tax")), status: g("status").toLowerCase(), method: g("method"), at: csvDate(g("created_at")), orderId: g("order_id") || undefined, description: g("description"), notes: { bookingId: (g("notes").match(BOOKING_ID) ?? [])[1] ?? "" }, refunded: money(g("amount_refunded")) });
    return { payments, refunds, settlements: [], kind: "payments export" };
  }
  throw new Error("Not a Razorpay report: use Settlements → Recon report, or Transactions → Payments → Export (CSV).");
}

/* ---------------- the matching ---------------- */
interface BankRow { id: string; date: string; description: string; ref?: string; amount: number }

export function reconcile(o: {
  gateway: { payments: GwPayment[]; refunds: GwRefund[]; settlements: GwSettlement[] };
  bookings: Booking[]; bank: BankRow[]; from: string; to: string; source: "api" | "csv";
}): ReconResult {
  /* index what bookings say about online payments */
  const byPayment = new Map<string, { b: Booking; amount: number }>();
  const ids = new Map(o.bookings.map((b) => [b.id, b]));
  for (const b of o.bookings) {
    for (const h of b.pay?.history ?? []) if (h.utr?.startsWith("pay_")) byPayment.set(h.utr, { b, amount: h.amount });
    if (b.pay?.utr?.startsWith("pay_") && !byPayment.has(b.pay.utr)) byPayment.set(b.pay.utr, { b, amount: b.pay.amount });
    for (const d of (b.admin as { duplicatePayments?: { paymentId: string; amount: number }[] }).duplicatePayments ?? []) byPayment.set(d.paymentId, { b, amount: d.amount });
  }
  const bookingOf = (p: GwPayment): Booking | null => {
    const hit = byPayment.get(p.id)?.b;
    if (hit) return hit;
    const id = p.notes?.bookingId || (p.description?.match(BOOKING_ID) ?? [])[1];
    return id ? ids.get(id) ?? null : null;
  };
  const issues: ReconIssue[] = [];
  const issue = (kind: IssueKind, severity: ReconIssue["severity"], ref: string, amount: number, text: string, bookingId?: string) => issues.push({ key: `${kind}:${ref}`, kind, severity, ref, amount, text, ...(bookingId ? { bookingId } : {}) });

  const payments: ReconRow[] = o.gateway.payments.map((p) => {
    const b = bookingOf(p);
    const rec = byPayment.get(p.id);
    const captured = p.status === "captured" || p.status === "refunded";
    let match: ReconRow["match"] = "ok";
    if (!captured) {
      match = "not_captured";
      if (rec) issue("gateway_not_captured", "high", p.id, p.amount, `Booking ${rec.b.id} counts payment ${p.id} as paid, but Razorpay shows it ${p.status}.`, rec.b.id);
    } else if (!b) {
      match = "no_booking";
      issue("orphan_payment", "high", p.id, p.amount, `₹${p.amount} captured in Razorpay (${p.id}, ${p.method || "online"}) with no booking that records it.`);
    } else if (!rec) {
      match = "no_booking";
      issue("orphan_payment", "high", p.id, p.amount, `₹${p.amount} captured for ${b.id} (${p.id}) but the booking doesn't record this payment — check the webhook / payment link callback.`, b.id);
    } else if (Math.abs(rec.amount - p.amount) >= 1) {
      match = "amount_mismatch";
      issue("amount_mismatch", "high", p.id, p.amount - rec.amount, `${b.id}: Razorpay captured ₹${p.amount} but the booking records ₹${rec.amount} for ${p.id}.`, b.id);
    }
    return { ...p, bookingId: b?.id ?? null, bookingAmount: rec?.amount ?? null, match };
  });

  /* bookings that say "paid online" inside the window but Razorpay has no such payment */
  const seen = new Set(o.gateway.payments.map((p) => p.id));
  if (o.source === "api") {
    for (const [pid, { b, amount }] of byPayment) {
      const day = (b.pay?.verifiedAt ?? b.pay?.at ?? b.created).slice(0, 10);
      if (day < o.from || day > o.to || seen.has(pid)) continue;
      if (!(b.pay?.gateway ?? "").startsWith("Razorpay")) continue;
      issue("not_in_gateway", "high", pid, amount, `${b.id} is marked paid online (${pid}, ₹${amount}) but Razorpay has no captured payment with that id in this period.`, b.id);
    }
  }
  /* second payments on an already-paid booking: refund them */
  for (const b of o.bookings) {
    for (const d of (b.admin as { duplicatePayments?: { paymentId: string; amount: number }[] }).duplicatePayments ?? []) {
      const refunded = o.gateway.refunds.some((r) => r.paymentId === d.paymentId) || o.gateway.payments.some((p) => p.id === d.paymentId && p.refunded >= d.amount);
      if (!refunded && seen.has(d.paymentId)) issue("duplicate_payment", "medium", d.paymentId, d.amount, `${b.id} was paid twice — refund ${d.paymentId} (₹${d.amount}) in Razorpay.`, b.id);
    }
  }
  const refunds = o.gateway.refunds.map((r) => {
    const p = o.gateway.payments.find((x) => x.id === r.paymentId);
    const b = byPayment.get(r.paymentId)?.b ?? (p ? bookingOf(p) : null);
    if (!b) issue("refund_no_booking", "medium", r.id, r.amount, `Refund ${r.id} (₹${r.amount}) on payment ${r.paymentId} isn't tied to any booking.`);
    return { ...r, bookingId: b?.id ?? null };
  });

  /* settlements → bank statement credits */
  const used = new Set<string>();
  const settlements: SettlementRow[] = o.gateway.settlements.map((s) => {
    const inIt = o.gateway.payments.filter((p) => p.settlementId === s.id);
    const expected = inIt.length ? Math.round((inIt.reduce((a, p) => a + p.amount - p.fee, 0) - o.gateway.refunds.filter((r) => inIt.some((p) => p.id === r.paymentId)).reduce((a, r) => a + r.amount, 0)) * 100) / 100 : null;
    let bank: SettlementRow["bank"] = null;
    const utrHit = s.utr ? o.bank.find((r) => !used.has(r.id) && r.amount > 0 && `${r.ref ?? ""} ${r.description}`.toUpperCase().includes(s.utr.toUpperCase())) : undefined;
    const amtHit = utrHit ?? o.bank.find((r) => !used.has(r.id) && Math.abs(r.amount - s.amount) < 1 && Math.abs(Date.parse(r.date) - Date.parse(s.at.slice(0, 10))) <= 3 * 86_400_000);
    if (amtHit) { used.add(amtHit.id); bank = { rowId: amtHit.id, date: amtHit.date, how: utrHit ? "utr" : "amount" }; }
    if (s.status === "processed" && !bank) issue("settlement_not_in_bank", "high", s.id, s.amount, `Settlement ${s.id} (₹${s.amount}${s.utr ? `, UTR ${s.utr}` : ""}) isn't in the imported bank statement — import the statement or check with the bank.`);
    if (expected != null && Math.abs(expected - s.amount) >= 1) issue("settlement_short", "high", s.id, s.amount - expected, `Settlement ${s.id} paid ₹${s.amount} but its payments less fees and refunds come to ₹${expected}.`);
    return { ...s, bank, expected };
  });

  const cap = payments.filter((p) => p.status === "captured" || p.status === "refunded");
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const settledIds = new Set(o.gateway.settlements.map((s) => s.id));
  return {
    runAt: new Date().toISOString(), from: o.from, to: o.to, source: o.source,
    payments, refunds, settlements, issues,
    totals: {
      captured: sum(cap.map((p) => p.amount)), count: cap.length, fees: sum(cap.map((p) => p.fee - p.tax)), tax: sum(cap.map((p) => p.tax)),
      refunds: sum(refunds.map((r) => r.amount)), net: sum(cap.map((p) => p.amount - p.fee)) - sum(refunds.map((r) => r.amount)),
      settled: sum(o.gateway.settlements.filter((s) => s.status === "processed").map((s) => s.amount)),
      unsettled: sum(cap.filter((p) => !p.settlementId || !settledIds.has(p.settlementId)).map((p) => p.amount - p.fee)),
    },
  };
}

/* ---------------- run + store ---------------- */
export async function loadRecon(sb: SB): Promise<ReconDoc> {
  const { data } = await sb.from("settings").select("doc").eq("id", "gateway_recon").maybeSingle();
  return (data?.doc as ReconDoc | null) ?? { last: null, resolved: {} };
}
async function saveRecon(sb: SB, doc: ReconDoc) {
  const { error } = await sb.from("settings").upsert({ id: "gateway_recon", doc, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
async function inputs(sb: SB) {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const [{ data: bk }, { data: bankRow }] = await Promise.all([
    sb.from("bookings").select("doc").gte("created", since).limit(5000),
    sb.from("settings").select("doc").eq("id", "bankrecon").maybeSingle(),
  ]);
  return { bookings: (bk ?? []).map((r) => r.doc as Booking), bank: ((bankRow?.doc as { rows?: BankRow[] } | null)?.rows ?? []) };
}

/** Run against the Razorpay API for [from, to] (IST days) and store the result. */
export async function runApiRecon(sb: SB, from: string, to: string): Promise<ReconResult> {
  if (!razorpayConfigured()) throw new Error("Razorpay keys are not set — upload a Razorpay CSV report instead.");
  const [gateway, { bookings, bank }] = await Promise.all([fetchGateway(from, to), inputs(sb)]);
  const result = reconcile({ gateway, bookings, bank, from, to, source: "api" });
  const doc = await loadRecon(sb);
  await saveRecon(sb, { ...doc, last: result });
  return result;
}

/** Run against an uploaded Razorpay CSV report. */
export async function runCsvRecon(sb: SB, csv: string): Promise<ReconResult & { kind: string }> {
  const parsed = parseGatewayCsv(csv);
  const days = parsed.payments.map((p) => p.at.slice(0, 10)).sort();
  const { bookings, bank } = await inputs(sb);
  const from = days[0] ?? istToday(), to = days.at(-1) ?? from;
  const result = reconcile({ gateway: parsed, bookings, bank, from, to, source: "csv" });
  const doc = await loadRecon(sb);
  await saveRecon(sb, { ...doc, last: result });
  return { ...result, kind: parsed.kind };
}

export async function setResolved(sb: SB, key: string, note: string | null) {
  const doc = await loadRecon(sb);
  const resolved = { ...doc.resolved };
  if (note == null) delete resolved[key]; else resolved[key] = { at: new Date().toISOString(), note: note.slice(0, 300) };
  await saveRecon(sb, { ...doc, resolved });
}

/** Daily: the last 7 days, at most once every 20 hours (called from the sweep). */
export async function dailyRecon(sb: SB): Promise<ReconResult | null> {
  if (!razorpayConfigured()) return null;
  const doc = await loadRecon(sb);
  if (doc.last && doc.last.source === "api" && Date.now() - Date.parse(doc.last.runAt) < 20 * 3600_000) return null;
  const day = (ms: number) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);
  return runApiRecon(sb, day(Date.now() - 7 * 86_400_000), day(Date.now()));
}
