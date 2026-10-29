"use client";
/** Bagdrop · B2B partner portal — travel agents, event companies and
 *  hotels book at RETAIL rates, collect from their client, keep their
 *  Bagdrop-set commission, and remit the net. Live ledger, per-booking
 *  tracking, retail rate chart, and bulk CSV upload that turns into a
 *  rate inquiry for the Bagdrop team. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

interface PortalData {
  agent: {
    id: string; name: string; company: string; type: string;
    commission: { mode: "pct" | "perbag"; value: number };
    remitted: { at: string; amount: number; note?: string }[];
    gstin?: string;
    billing: { mode: "remit" | "wallet" | "credit"; creditLimit: number };
    walletTxns: { at: string; amount: number; kind: string; ref?: string; note?: string; bookingId?: string }[];
    commissionPayouts: { at: string; amount: number; note?: string }[];
  };
  ledger: {
    rows: { id: string; created: string; status: string; lane: string; client: string; bags: number; retail: number; commission: number; net: number; date: string; billing: string }[];
    retail: number; commission: number; net: number; remitted: number; outstanding: number;
    billingMode: "remit" | "wallet" | "credit";
    walletBalance: number; creditLimit: number; creditAvailable: number;
    commissionDue: number; commissionPaidOut: number;
  };
  rates: { from: string; to: string; r1: number; r2: number; addl: number }[];
  cities: string[];
  tracking: { id: string; status: string; events: { at: string; text: string }[]; slot: string; date: string; verified?: boolean }[];
}

/* same service menu as the customer front end — full parity */
const SERVICES = [
  { uc: "d2a", mode: "air", title: "Home → Airport", sub: "Bags reach the airport first" },
  { uc: "a2d", mode: "air", title: "Airport → Home", sub: "Land and leave" },
  { uc: "h2a", mode: "air", title: "Hotel → Airport", sub: "Check out light" },
  { uc: "h2h", mode: "road", title: "Hotel → Hotel", sub: "Next city, same bags" },
  { uc: "d2d", mode: "road", title: "Door → Door", sub: "City to city, by road" },
  { uc: "rail", mode: "rail", title: "Railway station", sub: "Vande Bharat, Rajdhani" },
  { uc: "cruise", mode: "sea", title: "Cruise terminal", sub: "Mumbai, Goa, Kochi" },
] as const;
const SLOTS = ["06:00–08:00", "08:00–10:00", "10:00–12:00", "12:00–14:00", "16:00–18:00", "18:00–20:00"];

export default function PartnerPortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "data" }) });
    if (r.status === 401) { setAuthed(false); return; }
    setData(await r.json()); setAuthed(true);
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

  if (authed === null) return <Shell><p className="py-16 text-center text-sm text-muted">Opening the partner desk…</p></Shell>;
  if (!authed) return <Shell><Login onDone={load} /></Shell>;
  return <Shell>{data && <Portal data={data} reload={load} />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-display text-base font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span> <span className="text-muted">· Partner desk</span></span>
          <span className="text-xs text-muted">Book at retail · keep your commission · remit the net</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

/* ================= login ================= */
function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [f, setF] = useState({ code: "", key: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", code: f.code, key: f.key }) });
      if (!r.ok) { setErr("Wrong partner code or access key. Your Bagdrop account manager can reissue the key."); return; }
      await onDone();
    } finally { setBusy(false); }
  }
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="font-display text-xl font-extrabold">Partner sign in</h1>
      <p className="mb-4 mt-1 text-sm text-muted">For travel agents, event companies and hotels working with Bagdrop.</p>
      <Field label="Partner code"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="AG-YOURCOMPANY" /></Field>
      <Field label="Access key"><Input type="password" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void go(); }} /></Field>
      {err && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900">{err}</p>}
      <Button className="w-full" disabled={busy || !f.code || !f.key} onClick={() => void go()}>{busy ? "Signing in…" : "Sign in"}</Button>
    </Card>
  );
}

/* ================= portal ================= */
function Portal({ data, reload }: { data: PortalData; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<"book" | "bulk" | "ledger" | "rates" | "wallet">("ledger");
  const a = data.agent;
  const L = data.ledger;
  const commText = a.commission.mode === "pct" ? `${a.commission.value}% of retail` : `${inr(a.commission.value)} per bag`;
  const bm = a.billing.mode;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-extrabold">{a.company}</h1>
          <p className="text-xs text-muted">
            {a.name} · {a.type}{a.gstin ? ` · GSTIN ${a.gstin}` : ""} · commission: <b>{commText}</b> · billing: <b>{bm === "remit" ? "collect & remit" : bm === "wallet" ? "prepaid wallet" : "credit line"}</b> (set by Bagdrop)
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void fetch("/api/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).then(() => location.reload())}>Sign out</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Bookings" value={String(L.rows.length)} />
        <Kpi label="Your commission (lifetime)" value={inr(L.commission)} />
        {bm === "remit" && <Kpi label="Net payable to Bagdrop" value={inr(L.net)} />}
        {bm === "remit" && <Kpi label="Outstanding to remit" value={inr(L.outstanding)} warn={L.outstanding > 0} />}
        {bm === "wallet" && <Kpi label="Wallet balance" value={inr(L.walletBalance)} warn={L.walletBalance < 5000} />}
        {bm === "credit" && <Kpi label={`Credit available (of ${inr(L.creditLimit)})`} value={inr(L.creditAvailable)} warn={L.creditAvailable < 5000} />}
        {bm !== "remit" && <Kpi label="Commission due to you" value={inr(L.commissionDue)} />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([["ledger", "Ledger & tracking"], ["book", "New booking"], ["bulk", "Bulk upload"], ["rates", "Retail rate chart"], ...(bm !== "remit" ? [["wallet", bm === "wallet" ? "Wallet" : "Credit account"]] : [])] as [string, string][]).map(([k, n]) => (
          <button key={k} onClick={() => setTab(k as typeof tab)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${tab === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{n}</button>
        ))}
      </div>

      <div key={tab} className="anim-in">
        {tab === "ledger" && <Ledger data={data} />}
        {tab === "book" && <NewBooking data={data} reload={reload} />}
        {tab === "bulk" && <Bulk reload={reload} />}
        {tab === "rates" && <Rates data={data} />}
        {tab === "wallet" && <Wallet data={data} />}
      </div>
    </div>
  );
}

/* ---------- wallet / credit account ---------- */
function Wallet({ data }: { data: PortalData }) {
  const a = data.agent, L = data.ledger;
  const credit = a.billing.mode === "credit";
  return (
    <div className="grid gap-4">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">{credit ? "Credit account" : "Prepaid wallet"} <span className="font-normal text-faint">every booking is charged full retail here; your commission is paid back to you by Bagdrop</span></h3>
        <div className="mb-3 flex flex-wrap gap-4 rounded-xl bg-paper p-3 text-xs">
          {credit ? (
            <>
              <span>Credit limit: <b className="tabular-nums">{inr(L.creditLimit)}</b></span>
              <span>Used: <b className="tabular-nums">{inr(Math.max(0, -L.walletBalance))}</b></span>
              <span>Available: <b className={`tabular-nums ${L.creditAvailable < 5000 ? "text-amber-600" : "text-green-700"}`}>{inr(L.creditAvailable)}</b></span>
            </>
          ) : (
            <span>Balance: <b className={`tabular-nums ${L.walletBalance < 5000 ? "text-amber-600" : "text-green-700"}`}>{inr(L.walletBalance)}</b></span>
          )}
          <span>Commission due to you: <b className="tabular-nums text-green-700">{inr(L.commissionDue)}</b></span>
          <span>Commission paid out: <b className="tabular-nums">{inr(L.commissionPaidOut)}</b></span>
        </div>
        <p className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-900">
          {credit
            ? "To free up your credit line, settle by NEFT/UPI with your Bagdrop account manager — they record it here with the reference."
            : "To top up, pay by NEFT/UPI to Bagdrop and share the reference with your account manager — the balance updates here the moment it is recorded."}
        </p>
        <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Statement</h4>
        {a.walletTxns.length === 0 ? <p className="text-sm text-muted">No transactions yet.</p> : a.walletTxns.map((t, i) => (
          <p key={i} className="flex justify-between border-b border-dashed border-line py-1.5 text-xs last:border-0">
            <span><span className="text-faint">{new Date(t.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> · {t.kind}{t.bookingId ? ` · ${t.bookingId}` : ""}{t.ref ? ` · ref ${t.ref}` : ""}{t.note ? ` · ${t.note}` : ""}</span>
            <b className={`tabular-nums ${t.amount < 0 ? "" : "text-green-700"}`}>{t.amount < 0 ? "−" : "+"}{inr(Math.abs(t.amount))}</b>
          </p>
        ))}
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Commission payouts from Bagdrop</h3>
        {a.commissionPayouts.length === 0 ? <p className="text-sm text-muted">None yet — your accrued commission shows above as due.</p> : a.commissionPayouts.map((p, i) => (
          <p key={i} className="border-b border-dashed border-line py-1.5 text-xs last:border-0">
            <span className="text-faint">{new Date(p.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span> — <b>{inr(p.amount)}</b>{p.note ? ` · ${p.note}` : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}

/* ---------- ledger with tracking ---------- */
function Ledger({ data }: { data: PortalData }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Booking ledger <span className="font-normal text-faint">retail − your commission = net you remit</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Ref</th><th>Client</th><th>Lane · date</th><th className="text-right">Bags</th><th className="text-right">Retail</th><th className="text-right">Commission</th><th className="text-right">Net remit</th><th>Status</th></tr></thead>
            <tbody>
              {data.ledger.rows.length === 0 && <tr><td colSpan={8} className="py-4 text-muted">No bookings yet — make your first in the New booking tab.</td></tr>}
              {data.ledger.rows.map((r) => {
                const trk = data.tracking.find((t) => t.id === r.id);
                return (
                  <FragmentRow key={r.id} r={r} trk={trk} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 rounded-xl bg-paper p-3 text-xs">
          <span>Total retail: <b className="tabular-nums">{inr(data.ledger.retail)}</b></span>
          <span>Your commission: <b className="tabular-nums text-green-700">{inr(data.ledger.commission)}</b></span>
          <span>Net payable: <b className="tabular-nums">{inr(data.ledger.net)}</b></span>
          <span>Remitted so far: <b className="tabular-nums">{inr(data.ledger.remitted)}</b></span>
          <span>Outstanding: <b className={`tabular-nums ${data.ledger.outstanding > 0 ? "text-amber-600" : "text-green-700"}`}>{inr(data.ledger.outstanding)}</b></span>
        </div>
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Remittances recorded by Bagdrop</h3>
        {(data.agent.remitted ?? []).length === 0 ? <p className="text-sm text-muted">None yet.</p> :
          data.agent.remitted.map((r, i) => (
            <p key={i} className="border-b border-dashed border-line py-1.5 text-xs last:border-0">
              <span className="text-faint">{new Date(r.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span> — <b>{inr(r.amount)}</b>{r.note ? ` · ${r.note}` : ""}
            </p>
          ))}
      </Card>
    </div>
  );
}
function FragmentRow({ r, trk, open, onToggle }: { r: PortalData["ledger"]["rows"][number]; trk?: PortalData["tracking"][number]; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-line hover:bg-paper" onClick={onToggle}>
        <td className="py-1.5 font-mono text-[11px]">{r.id}</td>
        <td>{r.client}</td>
        <td className="text-muted">{r.lane} · {r.date || "—"}</td>
        <td className="text-right">{r.bags}</td>
        <td className="text-right tabular-nums">{inr(r.retail)}</td>
        <td className="text-right tabular-nums text-green-700">{inr(r.commission)}</td>
        <td className="text-right font-semibold tabular-nums">{r.billing === "remit" ? inr(r.net) : <span className="font-normal text-faint">{r.billing}</span>}</td>
        <td><Badge tone={r.status === "delivered" ? "ok" : ["rejected", "cancelled"].includes(r.status) ? "bad" : "info"}>{r.status.replace("_", " ")}</Badge></td>
      </tr>
      {open && trk && (
        <tr className="border-t border-dashed border-line bg-paper/60">
          <td colSpan={8} className="px-3 py-2 text-xs">
            <b className="font-display">Tracking · {r.id}</b>
            {trk.events.map((e, i) => (
              <p key={i} className="mt-1 text-muted"><span className="text-faint">{new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> — {e.text}</p>
            ))}
            <p className="mt-1 text-faint">Your client receives the same updates automatically on WhatsApp/email at every milestone.</p>
          </td>
        </tr>
      )}
    </>
  );
}

/* ---------- new booking — full parity with the customer front end ---------- */
interface Preview { ror: boolean; total?: number; base?: number; oversize?: number; gst?: number; billed?: number; perBag?: number; commission?: number; net?: number }
function NewBooking({ data, reload }: { data: PortalData; reload: () => Promise<void> }) {
  const [f, setF] = useState({
    uc: "d2a" as string, mode: "air" as string,
    name: "", mobile: "", email: "", fromName: "", toName: "",
    bags: 2, oversize: 0, date: "", slot: "", flight: "",
    pickAddr: "", dropAddr: "", note: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const bm = data.agent.billing.mode;
  const mobileOk = /^\+?[\d\s-]{10,15}$/.test(f.mobile.trim());

  /* server-priced preview — the same quote() + live masters the booking uses */
  useEffect(() => {
    if (!f.fromName.trim() || !f.toName.trim()) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", preview: { fromName: f.fromName.trim(), toName: f.toName.trim(), bags: f.bags, oversize: f.oversize, mode: f.mode, date: f.date || undefined } }) });
        setPreview(await r.json());
      } catch { setPreview(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [f.fromName, f.toName, f.bags, f.oversize, f.mode, f.date]);

  async function book() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/partner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "book", booking: { ...f, name: f.name.trim(), mobile: f.mobile.trim(), email: f.email.trim() || undefined, fromName: f.fromName.trim(), toName: f.toName.trim(), ucName: SERVICES.find((s) => s.uc === f.uc)?.title } }),
      });
      const j = await r.json();
      if (j.error) setMsg({ ok: false, text: j.detail ?? `Failed: ${j.error}` });
      else {
        setMsg({
          ok: true,
          text: j.billing === "remit"
            ? `Booked ${j.id} · collect ${inr(j.retail)} from your client · your commission ${inr(j.commission)} · remit ${inr(j.net)} to Bagdrop. Your client must verify Aadhaar before pickup — link sent automatically (also at bagdrop.co${j.verifyLink}).`
            : `Booked ${j.id} · ${inr(j.retail)} charged to your ${j.billing} (balance ${inr(j.walletBalance)}) · commission ${inr(j.commission)} accrues to you. Your client must verify Aadhaar before pickup — link sent automatically (also at bagdrop.co${j.verifyLink}).`,
        });
        setF({ uc: "d2a", mode: "air", name: "", mobile: "", email: "", fromName: "", toName: "", bags: 2, oversize: 0, date: "", slot: "", flight: "", pickAddr: "", dropAddr: "", note: "" });
        setPreview(null);
        await reload();
      }
    } finally { setBusy(false); }
  }
  const cities = useMemo(() => (data.cities?.length ? data.cities : [...new Set(data.rates.flatMap((r) => [r.from, r.to]))]).sort(), [data.cities, data.rates]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">New booking <span className="font-normal text-faint">{bm === "remit" ? "retail rate · you collect from the client" : bm === "wallet" ? "retail charged to your prepaid wallet" : "retail charged to your credit line"}</span></h3>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">1 · Service</p>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SERVICES.map((s) => (
            <button key={s.uc} type="button" onClick={() => setF({ ...f, uc: s.uc, mode: s.mode })}
              className={`cursor-pointer rounded-xl border p-2.5 text-left transition-colors ${f.uc === s.uc ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-stone-300"}`}>
              <b className="block text-xs">{s.title}</b><span className="text-[10px] text-muted">{s.sub}</span>
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">2 · Route</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Pickup city *"><Input list="pt-cities" value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} placeholder="Ahmedabad" /></Field>
          <Field label="Delivery city *"><Input list="pt-cities" value={f.toName} onChange={(e) => setF({ ...f, toName: e.target.value })} placeholder="Mumbai" /></Field>
          <datalist id="pt-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Pickup address"><Input value={f.pickAddr} onChange={(e) => setF({ ...f, pickAddr: e.target.value })} placeholder="Flat, building, area or pincode" /></Field>
          <Field label="Delivery address"><Input value={f.dropAddr} onChange={(e) => setF({ ...f, dropAddr: e.target.value })} placeholder="Hotel, home, terminal" /></Field>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">3 · When</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Travel date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={f.mode === "air" ? "Flight number" : "Reference (optional)"}><Input value={f.flight} onChange={(e) => setF({ ...f, flight: e.target.value })} placeholder="6E 5219" /></Field>
        </div>
        <p className="mb-1.5 text-[11px] text-muted">Pickup window</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SLOTS.map((s) => (
            <button key={s} type="button" onClick={() => setF({ ...f, slot: s })}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold ${f.slot === s ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-stone-300"}`}>{s}</button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">4 · Pieces</p>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {([["bags", "Bags · up to 32 kg each"], ["oversize", "Oversize · golf, surf, cycle"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-xl border border-line p-2.5">
              <span className="text-xs">{label}</span>
              <span className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setF({ ...f, [k]: Math.max(k === "bags" ? 0 : 0, f[k] - 1) })}>−</Button>
                <b className="w-6 text-center font-display">{f[k]}</b>
                <Button variant="outline" size="sm" onClick={() => setF({ ...f, [k]: f[k] + 1 })}>+</Button>
              </span>
            </div>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">5 · Your client (the traveller)</p>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Client name *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Client mobile *"><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} inputMode="tel" placeholder="+91 98XXX XXXXX" /></Field>
          <Field label="Client email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" /></Field>
        </div>
        <Field label="Anything we should know"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Gate code, fragile item inside" /></Field>
        {f.mobile.trim().length > 0 && !mobileOk && <p className="mb-2 text-xs text-red-700">That mobile doesn&apos;t look right — 10 digits, +91 optional.</p>}

        {preview?.ror && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">This lane isn&apos;t on the retail chart — send it through Bulk upload and the Bagdrop team will price it for you.</p>}
        <Button size="lg" disabled={busy || !f.name.trim() || !mobileOk || !preview || preview.ror || f.bags + f.oversize < 1} onClick={() => void book()}>
          {busy ? "Booking…" : preview && !preview.ror ? (bm === "remit" ? `Confirm booking · ${inr(preview.total!)}` : bm === "wallet" ? `Confirm & charge wallet · ${inr(preview.total!)}` : `Confirm on credit · ${inr(preview.total!)}`) : "Confirm booking"}
        </Button>
        {msg && <p className={`mt-3 rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      </Card>

      {/* live summary — same shape as the customer wizard's side card */}
      <aside>
        <Card className="lg:sticky lg:top-20">
          <h3 className="mb-2 font-display text-sm font-bold">This booking</h3>
          {([
            ["Service", SERVICES.find((s) => s.uc === f.uc)?.title],
            ["Route", f.fromName || f.toName ? `${f.fromName || "—"} → ${f.toName || "—"}` : "—"],
            ["Travel", `${f.date || "—"}${f.flight ? ` · ${f.flight.toUpperCase()}` : ""}`],
            ["Pickup", f.slot || "—"],
            ["Pieces", `${f.bags} bags${f.oversize ? ` + ${f.oversize} oversize` : ""}`],
            ["Client", f.name || "—"],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
              <span className="text-muted">{k}</span><span className="text-right">{v}</span>
            </div>
          ))}
          <div className="mt-3 overflow-hidden rounded-xl bg-ink p-4 text-cream">
            <p className="font-mono text-[11px] opacity-75">{preview && !preview.ror ? "Retail · server-priced live" : "Retail price"}</p>
            <p className="font-display text-3xl font-extrabold">{preview ? (preview.ror ? "On request" : inr(preview.total!)) : "—"}</p>
            {preview && !preview.ror && (
              <>
                <p className="mb-2 text-xs opacity-75">{inr(preview.perBag!)} per piece · {preview.billed} billed</p>
                {([["Base", preview.base!], ["Oversize", preview.oversize!], ["GST 5%", preview.gst!]] as const).map(([k, v]) =>
                  v > 0 || k === "Base" ? (
                    <div key={k} className="flex justify-between border-b border-white/15 py-1 text-xs last:border-0">
                      <span className="opacity-80">{k}</span><span className="font-mono">{inr(v)}</span>
                    </div>
                  ) : null
                )}
                <div className="mt-2 border-t border-white/25 pt-2 text-xs">
                  <div className="flex justify-between py-0.5"><span className="opacity-80">Your commission</span><span className="font-mono text-green-300">{inr(preview.commission!)}</span></div>
                  <div className="flex justify-between py-0.5"><span className="opacity-80">{bm === "remit" ? "Net you remit" : "Charged to " + (bm === "wallet" ? "wallet" : "credit")}</span><span className="font-mono">{inr(bm === "remit" ? preview.net! : preview.total!)}</span></div>
                </div>
              </>
            )}
          </div>
        </Card>
      </aside>
    </div>
  );
}

/* ---------- bulk upload ---------- */
function Bulk({ reload }: { reload: () => Promise<void> }) {
  const [rows, setRows] = useState<{ name: string; mobile: string; fromName: string; toName: string; bags: number; date?: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function onFile(file: File) {
    file.text().then((t) => {
      const lines = t.split(/\r?\n/).filter((l) => l.trim());
      const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const idx = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const iN = idx(["name"]), iM = idx(["mobile", "phone"]), iF = idx(["from", "pickup", "origin"]), iT = idx(["to", "drop", "destination"]), iB = idx(["bag", "piece"]), iD = idx(["date"]);
      setRows(lines.slice(1).map((l) => {
        const c = l.split(",").map((x) => x.trim());
        return { name: c[iN] ?? "", mobile: c[iM] ?? "", fromName: c[iF] ?? "", toName: c[iT] ?? "", bags: Number(c[iB]) || 1, date: iD >= 0 ? c[iD] : undefined };
      }).filter((r) => r.name && r.mobile));
      setMsg(null);
    });
  }
  async function send() {
    setBusy(true);
    try {
      const r = await fetch("/api/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk", rows }) });
      const j = await r.json();
      setMsg(j.error ? `Failed: ${j.error}` : `Inquiry ${j.inquiry} sent to Bagdrop — ${j.passengers} passengers · ${j.bags} bags · lanes: ${j.lanes.join(", ")}. The team comes back with your bulk rate; nothing is charged yet.`);
      if (!j.error) { setRows([]); await reload(); }
    } finally { setBusy(false); }
  }
  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">Bulk upload <span className="font-normal text-faint">weddings, events, groups — Bagdrop prices bulk by hand, always</span></h3>
      <p className="mb-3 text-xs text-muted">CSV with columns: name, mobile, from, to, bags, date. The upload becomes a rate inquiry — the Bagdrop team quotes your bulk rate before anything is booked.</p>
      <label className="inline-block cursor-pointer rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold shadow-card">
        Choose CSV
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
      {rows.length > 0 && (
        <>
          <p className="mt-3 text-sm">{rows.length} passengers parsed · {rows.reduce((s, r) => s + r.bags, 0)} bags · lanes: {[...new Set(rows.map((r) => `${r.fromName} → ${r.toName}`))].join(", ")}</p>
          <Button className="mt-2" disabled={busy} onClick={() => void send()}>{busy ? "Sending…" : "Send rate inquiry to Bagdrop"}</Button>
        </>
      )}
      {msg && <p className="mt-3 rounded-xl bg-paper p-3 text-sm">{msg}</p>}
    </Card>
  );
}

/* ---------- retail rates ---------- */
function Rates({ data }: { data: PortalData }) {
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Retail rate chart <span className="font-normal text-faint">what your client would pay on bagdrop.co — your commission comes out of this</span></h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Lane</th><th className="text-right">1 bag</th><th className="text-right">2 bags</th><th className="text-right">Each addl</th></tr></thead>
          <tbody>
            {data.rates.map((r) => (
              <tr key={`${r.from}-${r.to}`} className="border-t border-line">
                <td className="py-1.5">{r.from} ↔ {r.to}</td>
                <td className="text-right tabular-nums">{inr(r.r1)}</td>
                <td className="text-right tabular-nums">{inr(r.r2)}</td>
                <td className="text-right tabular-nums">{inr(r.addl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-faint">Rates exclude GST 5%, added at billing. Bulk/group moves are priced separately — use Bulk upload.</p>
    </Card>
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
