"use client";
/** BAGDROP OS · Finance — the CFO desk, modelled on the company's own Zoho
 *  Books organisation (pulled live via the Books connector): the BLS invoice
 *  register with its custom fields (Consignment No, No of Bags, Pickup/
 *  Delivery dates), GST5/IGST5 treatment, credit notes WITH EXPIRY, and the
 *  bank-reconciliation loop that clears "uncategorized transactions".
 *  Invoices are AUTO-ISSUED by the sweep the moment a payment is captured. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { gstSplit } from "@/lib/docs";
import { lanes } from "@/lib/intelligence";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import type { Booking, DocRecord } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { useProductionLeads } from "@/lib/useProductionLeads";
import DocumentView from "./DocumentView";

const PROD_CAPTURED_STATUSES = ["confirmed", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "delivered", "completed"];
const dayKey = (iso: string) => (iso || "").slice(0, 10);

interface CreditNote {
  id: string; bookingId?: string; customer: string; mobile?: string; amount: number;
  reason: string; issuedAt: string; expiresAt: string;
  status: "active" | "applied" | "expired" | "void"; appliedAt?: string;
}
interface StatementRow {
  id: string; date: string; description: string; ref?: string; amount: number;
  matchId?: string; matchKind?: string; status: "unmatched" | "suggested" | "reconciled" | "ignored";
}
interface LedgerEntry { id: string; kind: string; amount: number; date: string; label: string }

type Tab = "overview" | "payments" | "invoices" | "credit" | "bank";

export default function Finance() {
  const [all, setAll] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  const { leads: prodLeads } = useProductionLeads();
  const prodCapturedAll = prodLeads
    .filter((l) => l.booking && PROD_CAPTURED_STATUSES.includes(l.booking.status ?? ""))
    .reduce((a, l) => a + (l.booking?.totalAmount ?? 0), 0);
  const pendingVerification = all.filter((b) => b.pay?.status === "submitted").length;

  if (err) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Finance:</b> {err}</p>;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-1.5">
        {([["overview", "CFO overview"], ["payments", `UPI Payments${pendingVerification ? ` · ${pendingVerification}` : ""}`], ["invoices", "Invoices"], ["credit", "Credit notes"], ["bank", "Banking & reconciliation"]] as [Tab, string][]).map(([k, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${tab === k ? "text-white" : "hover:opacity-80"}`}
            style={tab === k ? { background: "var(--a-navy)" } : { background: "var(--a-surface-2)", color: "var(--a-muted)" }}>{n}</button>
        ))}
      </div>
      <div key={tab} className="anim-in">
        {tab === "overview" && <Overview all={all} prodCapturedAll={prodCapturedAll} />}
        {tab === "payments" && <PaymentVerification all={all} onChanged={(b) => setAll((p) => p.map((x) => (x.id === b.id ? b : x)))} />}
        {tab === "invoices" && <Invoices all={all} onChanged={(b) => setAll((p) => p.map((x) => (x.id === b.id ? b : x)))} />}
        {tab === "credit" && <CreditNotes bookings={all} />}
        {tab === "bank" && <BankRecon />}
      </div>
    </div>
  );
}

/* ================= UPI payment verification (static QR, no gateway) =================
 * The customer self-reports payment against the booking's QR (amount +
 * reference baked in); nothing here is auto-trusted — a human verifies
 * against what actually landed in the account before the booking confirms. */
function PaymentVerification({ all, onChanged }: { all: Booking[]; onChanged: (b: Booking) => void }) {
  const rows = useMemo(() => {
    const order: Record<string, number> = { submitted: 0, pending: 1, rejected: 2, captured: 3 };
    return all.filter((b) => b.pay).sort((a, b) => (order[a.pay!.status] ?? 9) - (order[b.pay!.status] ?? 9) || (b.pay!.submittedAt ?? b.pay!.at).localeCompare(a.pay!.submittedAt ?? a.pay!.at));
  }, [all]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function verify(b: Booking) {
    setBusyId(b.id);
    try {
      await adminApplyPatch(b, { pay: { ...b.pay!, status: "captured", verifiedAt: new Date().toISOString(), verifiedBy: "admin" }, status: "accepted" },
        `Payment verified via UPI (admin)${note[b.id] ? ` · ${note[b.id]}` : ""}`);
      onChanged({ ...b, pay: { ...b.pay!, status: "captured", verifiedAt: new Date().toISOString(), verifiedBy: "admin" }, status: "accepted" });
    } finally { setBusyId(null); }
  }
  async function reject(b: Booking) {
    setBusyId(b.id);
    try {
      const rejectedAt = new Date().toISOString();
      await adminApplyPatch(b, { pay: { ...b.pay!, status: "rejected", rejectedAt, rejectedNote: note[b.id] || undefined } },
        `Payment rejected via UPI (admin)${note[b.id] ? ` · ${note[b.id]}` : ""}`);
      onChanged({ ...b, pay: { ...b.pay!, status: "rejected", rejectedAt, rejectedNote: note[b.id] || undefined } });
    } finally { setBusyId(null); }
  }

  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">UPI payment verification</h3>
      <p className="mb-3 text-xs text-muted">Static QR, no gateway — a customer's &quot;I Have Completed Payment&quot; click only self-reports. Nothing is marked Payment Received until verified here against what actually landed in the account.</p>
      {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">No UPI payment submissions yet.</p>}
      <div className="grid gap-2">
        {rows.map((b) => {
          const p = b.pay!;
          const tone = p.status === "captured" ? "ok" : p.status === "rejected" ? "bad" : p.status === "submitted" ? "warn" : "muted";
          return (
            <div key={b.id} className="rounded-xl border border-line bg-white p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b className="font-mono text-[11px]">{b.id}</b> · {b.traveller.name}</span>
                <Badge tone={tone}>{p.status}</Badge>
              </div>
              <div className="mt-1 text-muted">
                Amount <b className="text-ink">{inr(p.amount)}</b>
                {p.utr && <> · UTR <span className="font-mono">{p.utr}</span></>}
                {p.submittedAt && <> · submitted {new Date(p.submittedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
                {p.rejectedNote && <> · note: {p.rejectedNote}</>}
              </div>
              {p.status === "submitted" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input className="w-48" placeholder="Internal note (optional)" value={note[b.id] ?? ""} onChange={(e) => setNote((p2) => ({ ...p2, [b.id]: e.target.value }))} />
                  <Button size="sm" disabled={busyId === b.id} onClick={() => void verify(b)}>{busyId === b.id ? "Saving…" : "Verify Payment"}</Button>
                  <Button size="sm" variant="outline" disabled={busyId === b.id} onClick={() => void reject(b)}>Reject Payment</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ================= CFO overview ================= */
function Overview({ all, prodCapturedAll }: { all: Booking[]; prodCapturedAll: number }) {
  const [c, setC] = useState<null | {
    capturedToday: number; capturedAll: number; gst: number; cgst: number; receivable: number;
    overdueN: number; series: { day: string; amt: number }[]; digest: string; invoices: number; cnActive: number;
  }>(null);
  useEffect(() => {
    void (async () => {
      const now = Date.now();
      const today = dayKey(new Date(now).toISOString());
      const paid = all.filter((b) => b.pay?.status === "captured");
      const capturedToday = paid.filter((b) => dayKey(b.pay!.at) === today).reduce((a, b) => a + b.pay!.amount, 0);
      const capturedAll = paid.reduce((a, b) => a + b.pay!.amount, 0);
      const gst = paid.reduce((a, b) => a + gstSplit(b.pay!.amount).gst, 0);
      const recRows = all.filter((b) => b.pay && b.pay.amount < b.quote.total && !["rejected", "cancelled"].includes(b.status));
      const receivable = recRows.reduce((a, b) => a + (b.quote.total - b.pay!.amount), 0);
      const overdueN = recRows.filter((b) => b.date && b.date < today).length;
      const series: { day: string; amt: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
        series.push({ day: d.slice(5), amt: paid.filter((b) => dayKey(b.pay!.at) === d).reduce((a, b) => a + b.pay!.amount, 0) });
      }
      const invoices = all.filter((b) => (b.docs ?? []).some((d) => d.type === "INV")).length;
      let cnActive = 0;
      try {
        const r = await fetch("/api/admin/finance/credit-notes");
        if (r.ok) cnActive = ((await r.json()).notes as CreditNote[]).filter((n) => n.status === "active").length;
      } catch { /* fine */ }
      const digest = [
        `Collections stand at ${inr(capturedAll)} lifetime (${inr(capturedToday)} today), with GST liability of ${inr(gst)} under GTA 5% (CGST ${inr(Math.round(gst / 2))} + SGST ${inr(gst - Math.round(gst / 2))} intra-state, IGST on interstate lanes).`,
        receivable > 0 ? `Receivables need attention: ${inr(receivable)} outstanding across ${recRows.length} bookings${overdueN ? `, ${overdueN} past their travel date — chase these first` : ""}.` : "No receivables outstanding — every paid booking is collected in full.",
        `${invoices} tax invoices are on file (auto-issued at payment), ${cnActive} credit notes are live, and bagdrop.co production has captured ${inr(prodCapturedAll)} on top.`,
      ].join(" ");
      setC({ capturedToday, capturedAll, gst, cgst: Math.round(gst / 2), receivable, overdueN, series, digest, invoices, cnActive });
    })();
  }, [all, prodCapturedAll]);

  if (!c) return <p className="text-sm text-muted">Computing the CFO view…</p>;
  const max = Math.max(1, ...c.series.map((s) => s.amt));
  const laneRows = lanes(all);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Captured today" value={inr(c.capturedToday)} />
        <Kpi label="Captured · lifetime" value={inr(c.capturedAll)} />
        <Kpi label="GST payable (5% GTA)" value={inr(c.gst)} hint={`CGST ${inr(c.cgst)} + SGST ${inr(c.gst - c.cgst)}`} />
        <Kpi label="Receivables" value={inr(c.receivable)} warn={c.receivable > 0} hint={c.overdueN ? `${c.overdueN} overdue` : "none overdue"} />
        <Kpi label="Invoices · credit notes" value={`${c.invoices} · ${c.cnActive}`} hint="auto-issued · active" />
      </div>

      <Card className="border-l-4 border-l-[#1B2A4A]">
        <h3 className="mb-1 font-display text-sm font-bold">CFO digest <span className="font-normal text-faint">written from the live ledger</span></h3>
        <p className="text-[13.5px] leading-relaxed">{c.digest}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void navigator.clipboard?.writeText(c.digest)}>Copy digest</Button>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-display text-sm font-bold">Cash in · last 14 days</h3>
          <div className="flex h-36 items-end gap-1.5">
            {c.series.map((s, i) => (
              <div key={s.day} className="group relative flex-1" title={`${s.day} · ${inr(s.amt)}`}>
                <div className="anim-in w-full rounded-t-md transition-all duration-500"
                  style={{ height: `${Math.max(3, (s.amt / max) * 130)}px`, background: s.amt > 0 ? "var(--a-accent)" : "var(--a-line)", animationDelay: `${i * 40}ms` }} />
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-faint">{i % 2 === 0 ? s.day.slice(3) : ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[11px] text-faint">Captured payments by day, GST-inclusive. Hover a bar for the amount.</p>
        </Card>
        <Card>
          <h3 className="mb-3 font-display text-sm font-bold">Lane economics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint"><th className="py-2 pr-2">Lane</th><th className="pr-2 text-right">Pcs</th><th className="pr-2 text-right">Rev/pc</th><th className="text-right">CM</th></tr></thead>
              <tbody>
                {laneRows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">No lane data yet.</td></tr>}
                {laneRows.map((l) => (
                  <tr key={l.lane} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2">{l.lane}</td>
                    <td className="pr-2 text-right">{l.pcs}</td>
                    <td className="pr-2 text-right tabular-nums">{inr(l.revPc)}</td>
                    <td className="text-right"><Badge tone={l.cm >= 25 ? "ok" : l.cm >= 20 ? "warn" : "bad"}>{l.cm}%</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================= invoices (Zoho Books register layout) ================= */
function Invoices({ all, onChanged }: { all: Booking[]; onChanged: (b: Booking) => void }) {
  const [filter, setFilter] = useState<"all" | "paid" | "partially_paid" | "no_invoice">("all");
  const [viewing, setViewing] = useState<{ booking: Booking; doc: DocRecord } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [docErr, setDocErr] = useState("");

  const rows = useMemo(() => all
    .filter((b) => b.pay?.status === "captured")
    .map((b) => {
      const invs = (b.docs ?? []).filter((d) => d.type === "INV");
      const inv = invs[invs.length - 1];
      const balance = Math.max(0, b.quote.total - b.pay!.amount);
      return {
        b, inv, balance,
        status: !inv ? "no_invoice" as const : balance > 0 ? "partially_paid" as const : "paid" as const,
      };
    })
    .filter((r) => filter === "all" || r.status === filter)
    .sort((x, y) => (y.inv?.at ?? y.b.created).localeCompare(x.inv?.at ?? x.b.created)), [all, filter]);

  async function issueNow(b: Booking) {
    setBusyId(b.id); setDocErr("");
    try {
      const r = await fetch("/api/admin/finance/doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: b.id, type: "INV" }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? "Failed");
      onChanged(j.booking as Booking);
    } catch (e) { setDocErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  }
  async function collect(b: Booking) {
    setBusyId(b.id);
    try { await adminApplyPatch(b, { pay: { ...b.pay!, amount: b.quote.total, mode: "full" } }, `Balance of ${inr(b.quote.total - b.pay!.amount)} collected`); }
    finally { setBusyId(null); }
  }

  const totals = rows.reduce((s, r) => ({ total: s.total + r.b.pay!.amount, balance: s.balance + r.balance }), { total: 0, balance: 0 });

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">Invoice register <span className="font-normal text-faint">auto-issued on payment · Zoho Books layout (BLS register fields)</span></h3>
        <Select className="w-auto py-1.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All statuses</option><option value="paid">Paid</option><option value="partially_paid">Partially paid</option><option value="no_invoice">Awaiting invoice</option>
        </Select>
      </div>
      {docErr && <p className="mb-2 text-xs text-red-700">{docErr}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-2">Invoice #</th><th className="pr-2">Date</th><th className="pr-2">Customer</th><th className="pr-2">Consignment No</th><th className="pr-2 text-right">Bags</th><th className="pr-2">Pickup date</th><th className="pr-2">Status</th><th className="pr-2 text-right">Total</th><th className="pr-2 text-right">Balance</th><th />
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted">No captured payments{filter !== "all" ? " in this status" : " yet"}.</td></tr>}
            {rows.map(({ b, inv, balance, status }) => (
              <tr key={b.id} className="border-t border-line">
                <td className="py-1.5 pr-2 font-mono text-[11px]">{inv ? inv.no : "—"}</td>
                <td className="pr-2">{dayKey(inv?.at ?? b.pay!.at)}</td>
                <td className="pr-2">{b.traveller.name}</td>
                <td className="pr-2 font-mono text-[11px]">{b.id}</td>
                <td className="pr-2 text-right">{b.bags + b.oversize}</td>
                <td className="pr-2">{b.date || "—"}</td>
                <td className="pr-2"><Badge tone={status === "paid" ? "ok" : status === "partially_paid" ? "warn" : "muted"}>{status === "no_invoice" ? "awaiting invoice" : status.replace("_", " ")}</Badge></td>
                <td className="pr-2 text-right tabular-nums">{inr(b.pay!.amount)}</td>
                <td className={`pr-2 text-right tabular-nums ${balance > 0 ? "font-bold text-amber-600" : ""}`}>{inr(balance)}</td>
                <td className="text-right">
                  {inv ? <Button size="sm" variant="ghost" onClick={() => setViewing({ booking: b, doc: inv })}>View</Button>
                    : <Button size="sm" variant="outline" disabled={busyId === b.id} onClick={() => void issueNow(b)}>{busyId === b.id ? "…" : "Issue now"}</Button>}
                  {balance > 0 && <Button size="sm" variant="ghost" disabled={busyId === b.id} onClick={() => void collect(b)}>Collect</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 rounded-xl bg-paper p-2.5 text-xs">
        <span>{rows.length} invoices</span>
        <span>Total: <b className="tabular-nums">{inr(totals.total)}</b></span>
        <span>Balance: <b className={`tabular-nums ${totals.balance > 0 ? "text-amber-600" : "text-green-700"}`}>{inr(totals.balance)}</b></span>
        <span className="text-faint">The sweep issues any missing invoice automatically within minutes of capture.</span>
      </div>
      {viewing && <DocumentView booking={viewing.booking} doc={viewing.doc} onClose={() => setViewing(null)} />}
    </Card>
  );
}

/* ================= credit notes (with expiry) ================= */
function CreditNotes({ bookings }: { bookings: Booking[] }) {
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ bookingId: "", customer: "", mobile: "", amount: "", reason: "", expiresAt: "" });
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/finance/credit-notes");
    const j = await r.json();
    if (!j.error) setNotes(j.notes);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function pickBooking(id: string) {
    const b = bookings.find((x) => x.id === id);
    setF((p) => ({ ...p, bookingId: id, customer: b?.traveller.name ?? p.customer, mobile: b?.traveller.mobile ?? p.mobile }));
  }
  async function act(body: unknown, after?: () => void) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/finance/credit-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.error) setMsg(j.detail ?? j.error);
      else { after?.(); await load(); }
    } finally { setBusy(false); }
  }

  const tone = (s: CreditNote["status"]) => (s === "active" ? "ok" : s === "applied" ? "info" : s === "expired" ? "warn" : "muted") as "ok" | "info" | "warn" | "muted";
  const liveValue = notes.filter((n) => n.status === "active").reduce((s, n) => s + n.amount, 0);

  return (
    <div className="grid gap-5">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Issue a credit note <span className="font-normal text-faint">CN series · unusable after the expiry date (auto-expired by the sweep)</span></h3>
        <div className="grid gap-x-3 sm:grid-cols-3">
          <Field label="Against booking (optional)">
            <Select className="py-2 text-xs" value={f.bookingId} onChange={(e) => pickBooking(e.target.value)}>
              <option value="">— standalone —</option>
              {bookings.filter((b) => b.pay).map((b) => <option key={b.id} value={b.id}>{b.id} · {b.traveller.name}</option>)}
            </Select>
          </Field>
          <Field label="Customer *"><Input className="py-2 text-xs" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} /></Field>
          <Field label="Mobile"><Input className="py-2 text-xs" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label="Amount ₹ *"><Input className="py-2 text-xs" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Expiry date *"><Input className="py-2 text-xs" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field>
          <Field label="Reason"><Input className="py-2 text-xs" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="service delay goodwill, cancellation…" /></Field>
        </div>
        <Button size="sm" disabled={busy || !f.customer.trim() || !Number(f.amount) || !f.expiresAt}
          onClick={() => void act({ action: "issue", bookingId: f.bookingId || undefined, customer: f.customer, mobile: f.mobile || undefined, amount: Number(f.amount), reason: f.reason, expiresAt: f.expiresAt }, () => setF({ bookingId: "", customer: "", mobile: "", amount: "", reason: "", expiresAt: "" }))}>
          {busy ? "Issuing…" : "Issue credit note"}
        </Button>
        {msg && <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900">{msg}</p>}
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Credit note register <span className="font-normal text-faint">live value {inr(liveValue)}</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5 pr-2">CN #</th><th className="pr-2">Customer</th><th className="pr-2">Booking</th><th className="pr-2 text-right">Amount</th><th className="pr-2">Issued</th><th className="pr-2">Expires</th><th className="pr-2">Reason</th><th className="pr-2">Status</th><th /></tr></thead>
            <tbody>
              {notes.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted">No credit notes yet.</td></tr>}
              {notes.map((n) => (
                <tr key={n.id} className="border-t border-line">
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{n.id}</td>
                  <td className="pr-2">{n.customer}</td>
                  <td className="pr-2 font-mono text-[11px]">{n.bookingId ?? "—"}</td>
                  <td className="pr-2 text-right tabular-nums">{inr(n.amount)}</td>
                  <td className="pr-2">{dayKey(n.issuedAt)}</td>
                  <td className={`pr-2 ${n.status === "active" && n.expiresAt <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) ? "font-bold text-amber-600" : ""}`}>{n.expiresAt}</td>
                  <td className="pr-2 text-muted">{n.reason || "—"}</td>
                  <td className="pr-2"><Badge tone={tone(n.status)}>{n.status}</Badge></td>
                  <td className="text-right">
                    {n.status === "active" && <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "apply", id: n.id, note: "applied from Finance" })}>Apply</Button>{" "}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "void", id: n.id })}>Void</Button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================= banking & reconciliation ================= */
function BankRecon() {
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/finance/recon");
    const j = await r.json();
    if (!j.error) { setRows(j.rows ?? []); setLedger(j.ledger ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function onFile(file: File) {
    void file.text().then(async (t) => {
      const lines = t.split(/\r?\n/).filter((l) => l.trim());
      const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const idx = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const iD = idx(["date"]), iN = idx(["desc", "narration", "particular"]), iR = idx(["ref", "utr", "cheque"]),
        iC = idx(["credit", "deposit"]), iDb = idx(["debit", "withdraw"]), iA = idx(["amount"]);
      const parsed = lines.slice(1).map((l) => {
        const c = l.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
        const credit = iC >= 0 ? Number(c[iC]?.replace(/[₹,]/g, "")) || 0 : 0;
        const debit = iDb >= 0 ? Number(c[iDb]?.replace(/[₹,]/g, "")) || 0 : 0;
        const amount = iA >= 0 && iC < 0 ? Number(c[iA]?.replace(/[₹,]/g, "")) || 0 : credit - debit;
        let date = c[iD] ?? "";
        const m = date.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
        if (m) date = `${m[3]}-${m[2]}-${m[1]}`;
        return { date, description: c[iN] ?? "", ref: iR >= 0 ? c[iR] : undefined, amount };
      }).filter((r) => r.date && r.amount !== 0);
      const r = await fetch("/api/admin/finance/recon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", bankName: "IOB", rows: parsed }) });
      const j = await r.json();
      setMsg(j.error ? (j.detail ?? j.error) : `Imported ${j.added} rows · ${j.suggested} auto-matched against the ledger (amount + date within 5 days).`);
      await load();
    });
  }
  async function setStatus(row: StatementRow, status: StatementRow["status"], matchId?: string) {
    setBusyId(row.id);
    try {
      await fetch("/api/admin/finance/recon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setStatus", id: row.id, status, matchId }) });
      await load();
    } finally { setBusyId(null); }
  }

  const stats = {
    uncat: rows.filter((r) => r.status === "unmatched").length,
    sugg: rows.filter((r) => r.status === "suggested").length,
    done: rows.filter((r) => r.status === "reconciled").length,
    credits: rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
  };
  const open = rows.filter((r) => r.status !== "reconciled" && r.status !== "ignored").sort((a, b) => b.date.localeCompare(a.date));
  const done = rows.filter((r) => r.status === "reconciled").sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Uncategorized transactions" value={String(stats.uncat)} warn={stats.uncat > 0} />
        <Kpi label="Auto-matched · to confirm" value={String(stats.sugg)} />
        <Kpi label="Reconciled" value={String(stats.done)} />
        <Kpi label="Statement credits" value={inr(stats.credits)} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">Import bank statement <span className="font-normal text-faint">CSV · date, narration, ref, credit/debit (IOB export format)</span></h3>
          <label className="cursor-pointer rounded-xl border border-line bg-white px-4 py-2 text-xs font-semibold shadow-card">
            Choose CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
        </div>
        {msg && <p className="mt-2 rounded-xl bg-paper p-2.5 text-xs">{msg}</p>}
        <p className="mt-2 text-[11px] text-faint">Credits are auto-matched to booking payments, agent remittances and wallet top-ups by exact amount within 5 days — confirm each match below, or match by hand. Nothing is written to any bank.</p>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">To reconcile <Badge tone={open.length ? "warn" : "ok"}>{open.length}</Badge></h3>
        {open.length === 0 && <p className="py-3 text-center text-sm text-muted">Nothing open — the bank and the ledger agree. 🎉</p>}
        <div className="grid gap-2">
          {open.map((r) => {
            const match = ledger.find((e) => e.id === r.matchId);
            return (
              <div key={r.id} className="anim-in rounded-xl border border-line p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b className="font-mono">{r.date}</b> · {r.description || "—"}{r.ref ? <span className="text-faint"> · {r.ref}</span> : ""}</span>
                  <b className={`tabular-nums ${r.amount < 0 ? "" : "text-green-700"}`}>{r.amount < 0 ? "−" : "+"}{inr(Math.abs(r.amount))}</b>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {r.status === "suggested" && match ? (
                    <>
                      <Badge tone="info">suggested</Badge>
                      <span className="text-muted">↔ {match.label} · {match.date}</span>
                      <Button size="sm" disabled={busyId === r.id} onClick={() => void setStatus(r, "reconciled")}>Confirm match</Button>
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => void setStatus(r, "unmatched", "")}>Reject</Button>
                    </>
                  ) : (
                    <>
                      <Select className="w-72 py-1.5 text-[11px]" value={r.matchId ?? ""} onChange={(e) => void setStatus(r, e.target.value ? "suggested" : "unmatched", e.target.value)}>
                        <option value="">Match to a ledger entry…</option>
                        {ledger.map((e) => <option key={e.id} value={e.id}>{e.label} · {inr(e.amount)} · {e.date}</option>)}
                      </Select>
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => void setStatus(r, "ignored")}>Ignore</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {done.length > 0 && (
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Reconciled <Badge tone="ok">{done.length}</Badge></h3>
          {done.slice(0, 15).map((r) => {
            const match = ledger.find((e) => e.id === r.matchId);
            return (
              <p key={r.id} className="flex justify-between border-b border-dashed border-line py-1 text-xs last:border-0">
                <span className="text-muted">{r.date} · {r.description || "—"} ↔ {match?.label ?? r.matchId}</span>
                <b className="tabular-nums text-green-700">{inr(Math.abs(r.amount))}</b>
              </p>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`block font-display text-xl font-extrabold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
