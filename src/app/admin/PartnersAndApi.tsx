"use client";
/** BAGDROP OS · Partners & API — the B2B agent program, live. Open full B2B
 *  accounts (travel agents, event companies, hotels) with company, GST/PAN,
 *  address and bank details; set each one's commission (percentage of retail
 *  or fixed ₹ per bag — only Bagdrop sets this); choose their billing mode
 *  (collect-&-remit, prepaid wallet, or a credit line — the wallet/credit
 *  trial is OPTIONAL and off by default); hand them portal credentials for
 *  /partner; watch ledgers; record remittances, top-ups, settlements and
 *  commission payouts. */
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

interface AgentRow {
  id: string; name: string; company: string; type: string; mobile: string; email?: string;
  gstin?: string; pan?: string; address?: string; city?: string; state?: string;
  bank?: { holder?: string; account?: string; ifsc?: string; upi?: string };
  code: string; key: string; commission: { mode: "pct" | "perbag"; value: number };
  billing?: { mode: "remit" | "wallet" | "credit"; creditLimit?: number };
  wallet?: { balance: number; txns: { at: string; amount: number; kind: string; ref?: string; note?: string; bookingId?: string }[] };
  commissionPayouts?: { at: string; amount: number; note?: string }[];
  remitted: { at: string; amount: number; note?: string }[];
  ledger: {
    rows: unknown[]; retail: number; commission: number; net: number; remitted: number; outstanding: number;
    billingMode: "remit" | "wallet" | "credit"; walletBalance: number; creditLimit: number; creditAvailable: number;
    commissionDue: number; commissionPaidOut: number;
  };
}

async function post(body: unknown): Promise<{ error?: string; detail?: string }> {
  const r = await fetch("/api/admin/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

export default function PartnersAndApi() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/agents");
    const j = await r.json();
    if (j.error) setErr(j.error); else { setAgents(j.agents); setErr(null); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 20000); return () => clearInterval(t); }, [load]);

  const totals = agents.reduce((s, a) => ({
    out: s.out + a.ledger.outstanding, n: s.n + a.ledger.rows.length,
    wallet: s.wallet + Math.max(0, a.ledger.walletBalance), commDue: s.commDue + a.ledger.commissionDue,
  }), { out: 0, n: 0, wallet: 0, commDue: 0 });

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Partners:</b> {err}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Agents" value={String(agents.length)} />
        <Kpi label="B2B bookings" value={String(totals.n)} />
        <Kpi label="Outstanding to collect (remit)" value={inr(totals.out)} warn={totals.out > 0} />
        <Kpi label="Wallet float held · comm. due" value={`${inr(totals.wallet)} · ${inr(totals.commDue)}`} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Agent accounts <span className="font-normal text-faint">portal: /partner · commission & billing set only here</span></h3>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "+ Open B2B account"}</Button>
      </div>
      {adding && <AgentForm onSaved={async () => { setAdding(false); await load(); }} />}

      <div className="grid gap-3">
        {agents.length === 0 && <Card><p className="py-4 text-center text-sm text-muted">No agents yet — open the first B2B account above.</p></Card>}
        {agents.map((a) => {
          const bm = a.billing?.mode ?? "remit";
          return (
            <Card key={a.id} className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <b className="font-display text-[15px]">{a.company}</b> <Badge tone="info">{a.type}</Badge>{" "}
                  <Badge tone={bm === "remit" ? "muted" : "ok"}>{bm === "remit" ? "collect & remit" : bm === "wallet" ? "prepaid wallet" : `credit ${inr(a.billing?.creditLimit ?? 0)}`}</Badge>
                  <p className="text-xs text-muted">{a.name} · {a.mobile}{a.email ? ` · ${a.email}` : ""}</p>
                  <p className="text-xs text-muted">{a.gstin ? `GSTIN ${a.gstin}` : "GSTIN —"}{a.pan ? ` · PAN ${a.pan}` : ""}{a.city ? ` · ${a.city}${a.state ? `, ${a.state}` : ""}` : ""}</p>
                  <p className="mt-1 text-xs">Portal: <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">{a.code}</code> · key <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">{a.key}</code>
                    <Button size="sm" variant="ghost" onClick={() => void post({ action: "rotateKey", id: a.id }).then(load)}>rotate</Button>
                  </p>
                </div>
                <div className="text-right text-xs">
                  <span className="block font-display text-base font-extrabold">{a.commission.mode === "pct" ? `${a.commission.value}%` : `${inr(a.commission.value)}/bag`}</span>
                  <span className="text-muted">commission</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 rounded-xl bg-paper p-2.5 text-xs">
                <span>{a.ledger.rows.length} bookings</span>
                <span>retail {inr(a.ledger.retail)}</span>
                <span className="text-green-700">commission {inr(a.ledger.commission)}</span>
                {bm === "remit" ? (
                  <>
                    <span>net {inr(a.ledger.net)}</span>
                    <span>remitted {inr(a.ledger.remitted)}</span>
                    <span className={a.ledger.outstanding > 0 ? "font-bold text-amber-600" : "font-bold text-green-700"}>outstanding {inr(a.ledger.outstanding)}</span>
                  </>
                ) : (
                  <>
                    <span className={a.ledger.walletBalance < 0 ? "font-bold text-amber-600" : "font-bold"}>{bm === "wallet" ? "wallet" : "balance"} {inr(a.ledger.walletBalance)}</span>
                    {bm === "credit" && <span>available {inr(a.ledger.creditAvailable)}</span>}
                    <span className={a.ledger.commissionDue > 0 ? "font-bold text-green-700" : ""}>comm. due {inr(a.ledger.commissionDue)}</span>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => setSel(sel === a.id ? null : a.id)}>{sel === a.id ? "Close" : "Account · money · edit"}</Button>
              </div>
              {sel === a.id && <AgentDetail a={a} onDone={load} />}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- full B2B onboarding form ---------- */
function AgentForm({ onSaved, agent }: { onSaved: () => Promise<void>; agent?: AgentRow }) {
  const [f, setF] = useState({
    id: agent?.id, name: agent?.name ?? "", company: agent?.company ?? "", type: agent?.type ?? "travel agent",
    mobile: agent?.mobile ?? "", email: agent?.email ?? "",
    gstin: agent?.gstin ?? "", pan: agent?.pan ?? "", address: agent?.address ?? "", city: agent?.city ?? "", state: agent?.state ?? "",
    bankHolder: agent?.bank?.holder ?? "", bankAccount: agent?.bank?.account ?? "", bankIfsc: agent?.bank?.ifsc ?? "", bankUpi: agent?.bank?.upi ?? "",
    mode: agent?.commission.mode ?? "pct", value: String(agent?.commission.value ?? 10),
    billMode: agent?.billing?.mode ?? "remit", creditLimit: String(agent?.billing?.creditLimit ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const j = await post({
        action: "save",
        agent: {
          id: f.id, name: f.name, company: f.company, type: f.type, mobile: f.mobile, email: f.email || undefined,
          gstin: f.gstin || undefined, pan: f.pan || undefined, address: f.address || undefined, city: f.city || undefined, state: f.state || undefined,
          bank: (f.bankHolder || f.bankAccount || f.bankIfsc || f.bankUpi) ? { holder: f.bankHolder || undefined, account: f.bankAccount || undefined, ifsc: f.bankIfsc || undefined, upi: f.bankUpi || undefined } : undefined,
          commission: { mode: f.mode, value: Number(f.value) || 0 },
          billing: { mode: f.billMode, creditLimit: Number(f.creditLimit) || 0 },
        },
      });
      if (j.error) { setErr(j.detail ?? j.error); return; }
      await onSaved();
    } finally { setBusy(false); }
  }
  return (
    <Card>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Company & contact</p>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <Field label="Company *"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="Contact person *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>travel agent</option><option>event company</option><option>hotel</option></Select></Field>
        <Field label="Mobile *"><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} inputMode="tel" /></Field>
        <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" /></Field>
      </div>

      <p className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-muted">Statutory · GST & PAN</p>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <Field label="GSTIN"><Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} placeholder="24ABCDE1234F1Z5" className="font-mono" /></Field>
        <Field label="PAN"><Input value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" className="font-mono" /></Field>
        <Field label="Registered address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="State"><Input value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></Field>
      </div>

      <p className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-muted">Bank · for commission payouts</p>
      <div className="grid gap-x-4 sm:grid-cols-4">
        <Field label="Account holder"><Input value={f.bankHolder} onChange={(e) => setF({ ...f, bankHolder: e.target.value })} /></Field>
        <Field label="Account no."><Input value={f.bankAccount} onChange={(e) => setF({ ...f, bankAccount: e.target.value })} className="font-mono" /></Field>
        <Field label="IFSC"><Input value={f.bankIfsc} onChange={(e) => setF({ ...f, bankIfsc: e.target.value.toUpperCase() })} className="font-mono" /></Field>
        <Field label="UPI id"><Input value={f.bankUpi} onChange={(e) => setF({ ...f, bankUpi: e.target.value })} /></Field>
      </div>

      <p className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-muted">Commercial · commission & billing (only Bagdrop sets these)</p>
      <div className="grid gap-x-4 sm:grid-cols-4">
        <Field label="Commission"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "pct" | "perbag" })}><option value="pct">% of retail</option><option value="perbag">₹ per bag</option></Select></Field>
        <Field label={f.mode === "pct" ? "Percent" : "₹ / bag"}><Input inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Billing (payments trial · optional)">
          <Select value={f.billMode} onChange={(e) => setF({ ...f, billMode: e.target.value as typeof f.billMode })}>
            <option value="remit">Collect & remit (default)</option>
            <option value="wallet">Prepaid wallet</option>
            <option value="credit">Credit line</option>
          </Select>
        </Field>
        {f.billMode === "credit" && <Field label="Credit limit (₹)"><Input inputMode="numeric" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value })} /></Field>}
      </div>
      {f.billMode !== "remit" && (
        <p className="mb-3 rounded-xl bg-blue-50 p-2.5 text-xs text-blue-900">
          {f.billMode === "wallet"
            ? "Wallet trial: every booking charges FULL RETAIL from the agent's prepaid balance; their commission accrues and you pay it back from the account panel. Top-ups are recorded by your team against a NEFT/UPI reference."
            : "Credit trial: bookings charge full retail against the limit; the agent settles by NEFT/UPI and your team records the settlement. Commission accrues and is paid back separately."}
        </p>
      )}
      {err && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900">{err}</p>}
      <Button size="sm" disabled={busy || !f.company || !f.name || !f.mobile} onClick={() => void save()}>{busy ? "Saving…" : agent ? "Save changes" : "Open account & issue portal access"}</Button>
    </Card>
  );
}

/* ---------- per-agent money desk ---------- */
function AgentDetail({ a, onDone }: { a: AgentRow; onDone: () => Promise<void> }) {
  const bm = a.billing?.mode ?? "remit";
  const [remit, setRemit] = useState({ amt: "", note: "" });
  const [topup, setTopup] = useState({ amt: "", ref: "", note: "" });
  const [payout, setPayout] = useState({ amt: "", note: "" });
  const [busy, setBusy] = useState(false);
  const act = (body: unknown, reset: () => void) => { setBusy(true); void post(body).then(() => { reset(); setBusy(false); return onDone(); }); };
  return (
    <div className="mt-2 grid gap-3">
      {bm === "remit" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
          <Field label={`Record remittance (outstanding ${inr(a.ledger.outstanding)})`}><Input className="w-32 py-2 text-xs" inputMode="numeric" value={remit.amt} onChange={(e) => setRemit({ ...remit, amt: e.target.value })} placeholder="₹" /></Field>
          <Field label="Note"><Input className="w-48 py-2 text-xs" value={remit.note} onChange={(e) => setRemit({ ...remit, note: e.target.value })} placeholder="NEFT ref, date range…" /></Field>
          <Button size="sm" disabled={busy || !Number(remit.amt)} onClick={() => act({ action: "remit", id: a.id, amount: Number(remit.amt), note: remit.note }, () => setRemit({ amt: "", note: "" }))}>Record</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
            <Field label={bm === "wallet" ? `Record wallet top-up (balance ${inr(a.ledger.walletBalance)})` : `Record settlement (balance ${inr(a.ledger.walletBalance)} of limit ${inr(a.ledger.creditLimit)})`}>
              <Input className="w-32 py-2 text-xs" inputMode="numeric" value={topup.amt} onChange={(e) => setTopup({ ...topup, amt: e.target.value })} placeholder="₹" />
            </Field>
            <Field label="NEFT/UPI ref"><Input className="w-36 py-2 text-xs font-mono" value={topup.ref} onChange={(e) => setTopup({ ...topup, ref: e.target.value })} /></Field>
            <Field label="Note"><Input className="w-40 py-2 text-xs" value={topup.note} onChange={(e) => setTopup({ ...topup, note: e.target.value })} /></Field>
            <Button size="sm" disabled={busy || !Number(topup.amt)} onClick={() => act({ action: "walletTxn", id: a.id, amount: Number(topup.amt), kind: bm === "wallet" ? "topup" : "settlement", ref: topup.ref, note: topup.note }, () => setTopup({ amt: "", ref: "", note: "" }))}>Record</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
            <Field label={`Record commission payout (due ${inr(a.ledger.commissionDue)})`}><Input className="w-32 py-2 text-xs" inputMode="numeric" value={payout.amt} onChange={(e) => setPayout({ ...payout, amt: e.target.value })} placeholder="₹" /></Field>
            <Field label="Note"><Input className="w-48 py-2 text-xs" value={payout.note} onChange={(e) => setPayout({ ...payout, note: e.target.value })} placeholder={a.bank?.upi ? `to ${a.bank.upi}` : "NEFT ref…"} /></Field>
            <Button size="sm" disabled={busy || !Number(payout.amt)} onClick={() => act({ action: "payout", id: a.id, amount: Number(payout.amt), note: payout.note }, () => setPayout({ amt: "", note: "" }))}>Pay out</Button>
          </div>
          {(a.wallet?.txns ?? []).length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Statement (latest first)</p>
              {[...(a.wallet?.txns ?? [])].reverse().slice(0, 12).map((t, i) => (
                <p key={i} className="flex justify-between border-b border-dashed border-line py-1 text-xs last:border-0">
                  <span><span className="text-faint">{new Date(t.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> · {t.kind}{t.bookingId ? ` · ${t.bookingId}` : ""}{t.ref ? ` · ${t.ref}` : ""}{t.note ? ` · ${t.note}` : ""}</span>
                  <b className={`tabular-nums ${t.amount < 0 ? "" : "text-green-700"}`}>{t.amount < 0 ? "−" : "+"}{inr(Math.abs(t.amount))}</b>
                </p>
              ))}
            </div>
          )}
        </>
      )}
      <AgentForm agent={a} onSaved={onDone} />
    </div>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`block font-display text-xl font-extrabold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</span>
    </Card>
  );
}
