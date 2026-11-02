"use client";
/** Finance · Gateway reconciliation (Razorpay). Runs by itself every day for
 *  the last 7 days, or on demand for any range up to 3 months; a Razorpay CSV
 *  report works when the API isn't available. Shows what Razorpay collected,
 *  its fees and GST on fees, refunds and settlements, matches every payment
 *  to its booking and every settlement to the bank statement, and lists each
 *  difference to resolve (with a note, kept across runs). */
import { useCallback, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { inr } from "@/lib/pricing";
import { Badge, Button, Card, Input } from "@/components/ui";
import type { ReconDoc, ReconIssue } from "@/lib/gatewayRecon";

type Doc = ReconDoc & { apiReady: boolean; mode: "live" | "test" };
const day = (ms: number) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const KIND: Record<ReconIssue["kind"], string> = {
  orphan_payment: "Paid in Razorpay, not on a booking", not_in_gateway: "Booking paid online, not in Razorpay", amount_mismatch: "Amount differs",
  gateway_not_captured: "Razorpay didn't capture it", duplicate_payment: "Paid twice — refund", refund_no_booking: "Refund without a booking",
  settlement_not_in_bank: "Settlement not in the bank", settlement_short: "Settlement amount differs",
};

export default function GatewayRecon() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [from, setFrom] = useState(() => day(Date.now() - 7 * 86_400_000));
  const [to, setTo] = useState(() => day(Date.now()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<"problems" | "all">("problems");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/finance/gateway", { cache: "no-store" });
    const j = await r.json();
    if (!j.error) setDoc(j);
  }, []);
  useLoad(load);

  async function post(body: Record<string, unknown>, ok: (j: Record<string, unknown>) => string) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/finance/gateway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: ok(j) } : { ok: false, text: j.detail ?? j.error ?? "Failed" });
    setBusy(false); await load();
  }

  const last = doc?.last ?? null;
  const resolved = doc?.resolved ?? {};
  const open = (last?.issues ?? []).filter((i) => !resolved[i.key]);
  const closed = (last?.issues ?? []).filter((i) => resolved[i.key]);
  const t = last?.totals;
  const payments = (last?.payments ?? []).filter((p) => show === "all" || p.match !== "ok");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold">Gateway reconciliation · Razorpay <Badge tone={doc?.mode === "live" ? "ok" : "warn"}>{doc?.mode === "live" ? "live keys" : "test keys"}</Badge></h3>
            <p className="text-xs text-muted">Runs by itself every day for the last 7 days. {last ? `Last run ${fmt(last.runAt)} · ${last.from} to ${last.to} · from ${last.source === "api" ? "the Razorpay API" : "a CSV report"}.` : "Not run yet."}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="grid gap-0.5"><span className="text-muted">From</span><Input type="date" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="grid gap-0.5"><span className="text-muted">To</span><Input type="date" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button size="sm" disabled={busy || !doc?.apiReady} onClick={() => void post({ action: "run", from, to }, (j) => `Checked ${j.payments} payment(s) · ${j.issues} item(s) to look at.`)}>{busy ? "Checking…" : "Run now"}</Button>
            <label className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 font-semibold">
              Upload Razorpay CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await post({ action: "csv", csv: await f.text() }, (j) => `${j.kind}: ${j.payments} payment(s) · ${j.issues} item(s) to look at.`); }} />
            </label>
          </div>
        </div>
        {!doc?.apiReady && <p className="mt-2 text-xs text-amber-800">Razorpay keys aren&apos;t set on this server — use the CSV upload (Razorpay → Settlements → Recon report, or Transactions → Payments → Export).</p>}
        {msg && <p className={`mt-2 rounded-lg p-2 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      </Card>

      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {([["Collected", inr(t.captured), `${t.count} payments`], ["Razorpay fees", inr(t.fees), "before GST"], ["GST on fees", inr(t.tax), "claim as input credit"], ["Refunds", inr(t.refunds), ""],
            ["Net due to us", inr(t.net), "collected − fees − refunds"], ["Settled to bank", inr(t.settled), ""], ["Not settled yet", inr(t.unsettled), "net of fees"]] as const).map(([l, v, h]) => (
            <Card key={l}><span className="block text-[11px] font-medium text-muted">{l}</span><span className="block font-display text-lg font-extrabold">{v}</span>{h && <span className="text-[10px] text-faint">{h}</span>}</Card>
          ))}
        </div>
      )}

      {last && (
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">To check <Badge tone={open.length ? "bad" : "ok"}>{open.length}</Badge></h3>
          {open.length === 0 && <p className="text-sm text-green-800">Everything matches: every Razorpay payment is on its booking at the right amount, and every settlement is in the bank.</p>}
          <div className="grid gap-2">
            {open.map((i) => <IssueRow key={i.key} issue={i} busy={busy} onResolve={(note) => void post({ action: "resolve", key: i.key, note }, () => "Marked resolved.")} />)}
          </div>
          {closed.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-semibold">Resolved · {closed.length}</summary>
              <ul className="mt-2 grid gap-1">
                {closed.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line py-1">
                    <span>{i.text} <span className="text-green-800">· {resolved[i.key].note} ({fmt(resolved[i.key].at)})</span></span>
                    <Button size="sm" variant="ghost" onClick={() => void post({ action: "reopen", key: i.key }, () => "Reopened.")}>Reopen</Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {last && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold">Payments <span className="font-normal text-faint">{last.payments.length} in Razorpay for the period</span></h3>
            <div className="flex gap-1 text-xs">
              {(["problems", "all"] as const).map((k) => <button key={k} onClick={() => setShow(k)} className={`cursor-pointer rounded-full px-3 py-1 font-semibold ${show === k ? "bg-ink text-white" : "bg-paper text-muted"}`}>{k === "problems" ? "Not matched" : "All"}</button>)}
            </div>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-faint"><th className="py-1.5 pr-2">Payment</th><th className="pr-2">When</th><th className="pr-2">Method</th><th className="pr-2 text-right">Amount</th><th className="pr-2 text-right">Fee + GST</th><th className="pr-2">Booking</th><th className="pr-2">Settlement</th><th>Match</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-dashed border-line last:border-0">
                    <td className="py-1.5 pr-2 font-mono">{p.id}</td>
                    <td className="pr-2">{fmt(p.at)}</td>
                    <td className="pr-2">{p.method || "—"} · {p.status}</td>
                    <td className="pr-2 text-right tabular-nums">{inr(p.amount)}</td>
                    <td className="pr-2 text-right tabular-nums">{inr(p.fee)}</td>
                    <td className="pr-2 font-mono">{p.bookingId ?? "—"}{p.bookingAmount != null && Math.abs(p.bookingAmount - p.amount) >= 1 ? ` (records ${inr(p.bookingAmount)})` : ""}</td>
                    <td className="pr-2 font-mono">{p.settlementId ?? "not yet"}</td>
                    <td><Badge tone={p.match === "ok" ? "ok" : p.match === "not_captured" ? "muted" : "bad"}>{p.match === "ok" ? "matched" : p.match === "no_booking" ? "no booking" : p.match === "amount_mismatch" ? "amount differs" : p.status}</Badge></td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-muted">{show === "problems" ? "Every payment matches its booking." : "No payments in this period."}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {last && (
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Settlements to the bank <span className="font-normal text-faint">matched to Finance → Bank by UTR, else by amount within 3 days</span></h3>
          {last.settlements.length === 0 && <p className="text-sm text-muted">No settlements in this period{doc?.mode === "test" ? " (test mode doesn't settle money)" : ""}.</p>}
          {last.settlements.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-faint"><th className="py-1.5 pr-2">Settlement</th><th className="pr-2">Date</th><th className="pr-2">UTR</th><th className="pr-2 text-right">Amount</th><th className="pr-2 text-right">Fees + GST</th><th>In the bank</th></tr></thead>
              <tbody>
                {last.settlements.map((s) => (
                  <tr key={s.id} className="border-b border-dashed border-line last:border-0">
                    <td className="py-1.5 pr-2 font-mono">{s.id}</td><td className="pr-2">{s.at.slice(0, 10)}</td><td className="pr-2 font-mono">{s.utr || "—"}</td>
                    <td className="pr-2 text-right tabular-nums">{inr(s.amount)}{s.expected != null && Math.abs(s.expected - s.amount) >= 1 ? <span className="text-red-700"> (expected {inr(s.expected)})</span> : null}</td>
                    <td className="pr-2 text-right tabular-nums">{inr(s.fees + s.tax)}</td>
                    <td>{s.bank ? <Badge tone="ok">{s.bank.date} · by {s.bank.how}</Badge> : <Badge tone={s.status === "processed" ? "bad" : "muted"}>{s.status === "processed" ? "not found" : s.status}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

function IssueRow({ issue, busy, onResolve }: { issue: ReconIssue; busy: boolean; onResolve: (note: string) => void }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border p-2.5 text-xs ${issue.severity === "high" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span><b>{KIND[issue.kind]}</b> · {issue.text}</span>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>Resolve</Button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input className="flex-1" placeholder="How was it resolved? e.g. refunded on 3 Nov, ref rfnd_…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={busy || note.trim().length < 3} onClick={() => onResolve(note.trim())}>Save</Button>
        </div>
      )}
    </div>
  );
}
