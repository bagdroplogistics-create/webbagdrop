"use client";
/** Admin OS · Finance — ported from the static build's m-fin module
 *  (admin.js ~L1711-1768, L2230-2680). Payment lives on the booking
 *  (`pay`); documents (invoice/receipt/etc.) log to `docs[]` with
 *  race-safe numbers from the database's next_doc_no().
 *
 *  Not yet ported: the Reconciliation/export panel (Razorpay/Stripe/Zoho
 *  Books/GST e-invoice/investor pack) was pure static text with zero
 *  functionality in the original too — nothing real is missing. Credit
 *  voucher, GST credit note, and bank-statement reconciliation are left
 *  for later; this covers the everyday loop (balance collection + the
 *  core documents). */
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { gstSplit } from "@/lib/docs";
import { lanes } from "@/lib/intelligence";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import type { Booking, DocRecord, DocType } from "@/lib/types";
import { Badge, Button, Card, Select } from "@/components/ui";
import DocumentView from "./DocumentView";

const dayKey = (iso: string) => (iso || "").slice(0, 10);

const DOC_LABEL: Record<DocType, string> = {
  PI: "Proforma invoice", INV: "Tax invoice", RCT: "Payment receipt", CSH: "Cash receipt",
  LR: "LR", CV: "Credit voucher", CN: "GST credit note", TR: "Trip", MF: "Manifest",
};

interface Kpis { capturedToday: number; capturedAll: number; gst: number; balanceDue: number }

export default function Finance() {
  const [all, setAll] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);

  // Date.now() is read in an effect, not during render — Next's Cache
  // Components flags a bare current-time read in a Client Component's
  // render path (see the same note in CommandCentre.tsx).
  const [kpis, setKpis] = useState<Kpis | null>(null);
  useEffect(() => {
    const today = dayKey(new Date(Date.now()).toISOString());
    const paid = all.filter((b) => b.pay);
    const capturedToday = paid.filter((b) => dayKey(b.pay!.at) === today).reduce((a, b) => a + b.pay!.amount, 0);
    const capturedAll = paid.reduce((a, b) => a + b.pay!.amount, 0);
    const gst = paid.reduce((a, b) => a + gstSplit(b).gst, 0);
    const balanceDue = all
      .filter((b) => b.pay && b.pay.amount < b.quote.total)
      .reduce((a, b) => a + (b.quote.total - b.pay!.amount), 0);
    setKpis({ capturedToday, capturedAll, gst, balanceDue });
  }, [all]);

  const balanceRows = useMemo(
    () => all.filter((b) => b.pay && b.pay.amount < b.quote.total && !["rejected", "cancelled"].includes(b.status)),
    [all]
  );
  const laneRows = useMemo(() => lanes(all), [all]);

  const [busyId, setBusyId] = useState<string | null>(null);
  async function collect(b: Booking) {
    setBusyId(b.id);
    try {
      await adminApplyPatch(b, { pay: { ...b.pay!, amount: b.quote.total, mode: "full" } }, `Balance of ₹${(b.quote.total - b.pay!.amount).toLocaleString("en-IN")} collected`);
    } finally { setBusyId(null); }
  }

  if (!kpis) return <p className="text-sm text-muted">Reading the ledger…</p>;

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Captured today" value={inr(kpis.capturedToday)} />
        <Kpi label="Captured, all time" value={inr(kpis.capturedAll)} />
        <Kpi label="GST collected" value={inr(kpis.gst)} />
        <Kpi label="Balance due" value={inr(kpis.balanceDue)} hint="partial payments" />
      </div>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Balance payments <Badge tone="ok">live</Badge></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Ref</th><th className="pr-2">Customer</th><th className="pr-2 text-right">Paid</th><th className="pr-2 text-right">Total</th><th className="pr-2 text-right">Balance</th><th></th>
              </tr>
            </thead>
            <tbody>
              {balanceRows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">Nothing outstanding.</td></tr>}
              {balanceRows.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                  <td className="pr-2">{b.traveller.name}</td>
                  <td className="pr-2 text-right">{inr(b.pay!.amount)}</td>
                  <td className="pr-2 text-right">{inr(b.quote.total)}</td>
                  <td className="pr-2 text-right font-semibold">{inr(b.quote.total - b.pay!.amount)}</td>
                  <td><Button size="sm" variant="outline" disabled={busyId === b.id} onClick={() => void collect(b)}>{busyId === b.id ? "…" : "Collect"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-display text-sm font-bold">Lane economics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                  <th className="py-2 pr-2">Lane</th><th className="pr-2 text-right">Pcs</th><th className="pr-2 text-right">Rev/pc</th><th className="text-right">CM</th>
                </tr>
              </thead>
              <tbody>
                {laneRows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">No lane data yet.</td></tr>}
                {laneRows.map((l) => (
                  <tr key={l.lane} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2">{l.lane}</td>
                    <td className="pr-2 text-right">{l.pcs}</td>
                    <td className="pr-2 text-right">{inr(l.revPc)}</td>
                    <td className="text-right"><Badge tone={l.cm >= 25 ? "ok" : l.cm >= 20 ? "warn" : "bad"}>{l.cm}%</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <DocumentPanel bookings={all} onIssued={(b) => setAll((p) => p.map((x) => (x.id === b.id ? b : x)))} />
      </div>
    </div>
  );
}

function DocumentPanel({ bookings, onIssued }: { bookings: Booking[]; onIssued: (b: Booking) => void }) {
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState<DocType | null>(null);
  const [err, setErr] = useState("");
  const [viewing, setViewing] = useState<DocRecord | null>(null);
  const booking = bookings.find((b) => b.id === sel) ?? null;

  async function issue(type: DocType) {
    if (!booking) return;
    setBusy(type); setErr("");
    try {
      const amount = type === "CSH" && !booking.pay ? booking.quote.total : undefined;
      const r = await fetch("/api/admin/finance/doc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, type, amount }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? "Failed");
      onIssued(j.booking as Booking);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }

  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Documents</h3>
      <Select value={sel} onChange={(e) => setSel(e.target.value)} className="mb-3">
        <option value="">Choose a booking…</option>
        {bookings.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.traveller.name} · {inr(b.quote.total)}</option>)}
      </Select>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["PI", "INV", "RCT", "CSH"] as DocType[]).map((t) => (
          <Button key={t} size="sm" variant="outline" disabled={!booking || busy !== null} onClick={() => void issue(t)}>
            {busy === t ? "…" : DOC_LABEL[t]}
          </Button>
        ))}
      </div>
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}
      {booking && (
        <ul className="space-y-1 text-xs">
          {(booking.docs ?? []).length === 0 && <li className="text-muted">No documents yet on this booking.</li>}
          {(booking.docs ?? []).map((d, i) => (
            <li key={i} className="border-b border-dashed border-line last:border-0">
              <button onClick={() => setViewing(d)} className="flex w-full justify-between py-1 text-left hover:text-brand">
                <span>{DOC_LABEL[d.type]} <span className="font-mono">{d.no}</span></span>
                <span>{inr(d.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing && booking && <DocumentView booking={booking} doc={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="block font-display text-xl font-extrabold">{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
