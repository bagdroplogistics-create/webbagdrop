"use client";
/** BAGDROP OS · Tracking Inspector — watches every shipment booking →
 *  delivery against the SOP rulebook (src/lib/inspector.ts). Anything slow,
 *  stuck or off-plan surfaces as a flag; each flag is assigned to a
 *  department and/or a specific number (vendor, captain, client) and goes
 *  out as a WhatsApp + email pair, stamped on the booking's event log. */
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

interface Dept { key: string; name: string; mobile?: string; email?: string }
interface FlagRow {
  bookingId: string; rule: string; sop: string; severity: "red" | "amber";
  title: string; detail: string; dept: string; ageH: number;
  client: { name: string; mobile: string }; vendorMobile?: string; captain?: string;
  lane: string; date: string; slot: string; status: string; dispatched?: boolean;
}
interface JourneyRow {
  id: string; lane: string; status: string; date: string; slot: string;
  client: string; mobile: string;
  stops: { key: string; name: string; at: string | null }[];
  doneCount: number; current: string; lastMoveH: number;
  severity: "red" | "amber" | "ok"; pickupInH: number | null;
}
interface Data { watching: number; flags: FlagRow[]; journeys: JourneyRow[]; departments: Dept[] }

const SEV = {
  red: { line: "#DC2626", chip: "bad" as const, label: "SLA breached" },
  amber: { line: "#D97706", chip: "warn" as const, label: "at risk" },
  ok: { line: "#1E7F4F", chip: "ok" as const, label: "on plan" },
};

/** The live motion board — one animated journey rail per shipment. */
function LiveTracker({ rows }: { rows: JourneyRow[] }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">Live shipment tracker <span className="font-normal text-faint">booked → delivered · every shipment, every stop</span></h3>
        <span className="flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold">
          <span className="trk-here size-2 rounded-full bg-green-600 text-green-600" />
          Chief Tracking Officer · on duty 24×7
        </span>
      </div>
      <div className="grid gap-2.5">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">No active shipments right now.</p>}
        {rows.map((r, i) => {
          const sev = SEV[r.severity];
          const total = r.stops.length;
          const pct = Math.min(100, (Math.max(0, r.doneCount - 0.5) / (total - 1)) * 100);
          const delivered = r.doneCount === total;
          return (
            <div key={r.id} className="anim-in rounded-xl border border-line bg-white p-3" style={{ animationDelay: `${i * 45}ms` }}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2">
                  <b className="font-mono text-[11.5px]">{r.id}</b>
                  <span className="text-muted">{r.lane} · {r.client}</span>
                  <Badge tone={sev.chip}>{sev.label}</Badge>
                </span>
                <span className="text-muted">
                  now: <b className="text-ink">{r.current}</b> · last movement {r.lastMoveH < 1 ? "<1h" : `${r.lastMoveH.toFixed(0)}h`} ago
                  {r.pickupInH !== null && r.doneCount < 3 && (r.pickupInH < 0 ? <b className="text-red-600"> · pickup {(-r.pickupInH).toFixed(0)}h late</b> : ` · pickup in ${r.pickupInH.toFixed(0)}h`)}
                </span>
              </div>
              {/* the rail */}
              <div className="relative mt-2.5 h-7">
                <div className="absolute left-0 right-0 top-[9px] h-1 rounded-full bg-line" />
                <div className="absolute top-[9px] h-1 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: sev.line }} />
                {!delivered && (
                  <div className="trk-moving absolute top-[9px] h-1 rounded-full opacity-80" style={{ left: `${pct}%`, width: `${Math.min(14, 100 - pct)}%`, color: sev.line }} />
                )}
                {r.stops.map((s, j) => {
                  const x = (j / (total - 1)) * 100;
                  const done = !!s.at;
                  const isCurrent = !done && r.stops.slice(0, j).every((p) => p.at);
                  return (
                    <span key={s.key} title={`${s.name}${s.at ? ` · ${new Date(s.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : " · pending"}`}
                      className={`absolute top-[5px] size-[11px] -translate-x-1/2 rounded-full border-2 ${isCurrent ? "trk-here" : ""}`}
                      style={{ left: `${x}%`, background: done ? sev.line : "#fff", borderColor: done || isCurrent ? sev.line : "var(--a-line)", color: sev.line }} />
                  );
                })}
              </div>
              <div className="mt-0.5 flex justify-between text-[9.5px] uppercase tracking-wide text-faint">
                <span>Booked</span><span className="hidden sm:inline">Picked up</span><span className="hidden sm:inline">Linehaul</span><span>Delivered</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function Inspector() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showDepts, setShowDepts] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/inspector");
    const j = await r.json();
    if (j.error) setErr(j.error); else { setD(j); setErr(null); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 30000); return () => clearInterval(t); }, [load]);

  if (err) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Inspector:</b> {err}</p>;
  if (!d) return <p className="text-sm text-muted">Inspecting every shipment against the SOP rulebook…</p>;

  const red = d.flags.filter((f) => f.severity === "red");
  const amber = d.flags.filter((f) => f.severity === "amber");

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Shipments under watch" value={String(d.watching)} />
        <Kpi label="SLA breached · act now" value={String(red.length)} tone={red.length ? "bad" : "ok"} />
        <Kpi label="At risk · drifting" value={String(amber.length)} tone={amber.length ? "warn" : "ok"} />
        <Kpi label="Moving to plan" value={String(Math.max(0, d.watching - new Set(d.flags.map((f) => f.bookingId)).size))} tone="ok" />
      </div>

      <LiveTracker rows={d.journeys ?? []} />

      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Flags <span className="font-normal text-faint">9 SOPs · CTO auto-dispatches every red flag 24×7 · worst first</span></h3>
        <Button size="sm" variant="outline" onClick={() => setShowDepts((v) => !v)}>{showDepts ? "Close departments" : "Departments & contacts"}</Button>
      </div>
      {showDepts && <Departments depts={d.departments} onSaved={load} />}

      {d.flags.length === 0 && (
        <Card><p className="py-6 text-center text-sm text-muted">✅ Everything under watch is moving to plan — no SOP is breached right now.</p></Card>
      )}
      <div className="grid gap-2.5">
        {d.flags.map((f, i) => (
          <FlagCard key={`${f.bookingId}:${f.rule}`} f={f} depts={d.departments} onDone={load} delay={i * 40} />
        ))}
      </div>
    </div>
  );
}

function FlagCard({ f, depts, onDone, delay }: { f: FlagRow; depts: Dept[]; onDone: () => Promise<void>; delay: number }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ deptKey: f.dept, extraMobile: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const red = f.severity === "red";

  async function dispatch() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/inspector", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flag", bookingId: f.bookingId, rule: f.rule, title: f.title, detail: f.detail, deptKey: form.deptKey, extraMobile: form.extraMobile, note: form.note }),
      });
      const j = await r.json();
      if (j.error) setMsg(j.detail ?? j.error);
      else { setMsg(`Dispatched — ${j.queued} message(s) queued (WhatsApp + email) and stamped on ${f.bookingId}.`); await onDone(); }
    } finally { setBusy(false); }
  }

  return (
    <Card className={`anim-in border-l-4 ${red ? "border-l-red-500" : "border-l-amber-400"}`} >
      <div style={{ animationDelay: `${delay}ms` }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={red ? "bad" : "warn"}>{red ? "SLA breached" : "at risk"}</Badge>
              <b className="font-display text-[14px]">{f.title}</b>
              <span className="font-mono text-[11px] text-muted">{f.bookingId}</span>
              {f.dispatched && <Badge tone="info">flag sent</Badge>}
            </div>
            <p className="mt-1 text-[13px]">{f.detail}</p>
            <p className="mt-0.5 text-xs text-muted">{f.lane} · {f.date} {f.slot} · status {f.status.replace("_", " ")} · client {f.client.name} ({f.client.mobile}){f.captain ? ` · captain ${f.captain}` : ""}{f.vendorMobile ? ` · vendor ${f.vendorMobile}` : ""}</p>
            <p className="mt-1 rounded-lg bg-paper px-2 py-1 text-[11px] text-muted"><b>SOP:</b> {f.sop}</p>
          </div>
          <div className="text-right">
            <span className="block font-display text-base font-extrabold tabular-nums">{f.ageH < 1 ? "<1h" : `${f.ageH.toFixed(0)}h`}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted">off plan</span>
            <Button size="sm" className="mt-1.5 block" variant={red ? "default" : "outline"} onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Assign & alert"}</Button>
          </div>
        </div>

        {open && (
          <div className="anim-in mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-paper/60 p-3">
            <Field label="Department">
              <Select className="py-2 text-xs" value={form.deptKey} onChange={(e) => setForm({ ...form, deptKey: e.target.value })}>
                {depts.map((dp) => <option key={dp.key} value={dp.key}>{dp.name}{dp.mobile || dp.email ? "" : " · no contact"}</option>)}
              </Select>
            </Field>
            <Field label="Also alert number (vendor / captain / client)">
              <Input className="w-44 py-2 text-xs" inputMode="tel" list={`c-${f.bookingId}-${f.rule}`} value={form.extraMobile} onChange={(e) => setForm({ ...form, extraMobile: e.target.value })} placeholder="optional" />
              <datalist id={`c-${f.bookingId}-${f.rule}`}>
                {f.vendorMobile && <option value={f.vendorMobile}>vendor</option>}
                <option value={f.client.mobile}>client</option>
              </datalist>
            </Field>
            <Field label="Note"><Input className="w-48 py-2 text-xs" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="what you need done" /></Field>
            <Button size="sm" disabled={busy} onClick={() => void dispatch()}>{busy ? "Sending…" : "Send flag →"}</Button>
          </div>
        )}
        {msg && <p className="mt-2 rounded-xl bg-paper p-2.5 text-xs text-muted">{msg}</p>}
      </div>
    </Card>
  );
}

function Departments({ depts, onSaved }: { depts: Dept[]; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState<Dept[]>(depts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/inspector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveDepts", departments: rows }) });
      const j = await r.json();
      if (j.error) setMsg(j.error); else { setMsg("Saved — flags route to these contacts."); await onSaved(); }
    } finally { setBusy(false); }
  }
  return (
    <Card className="anim-in">
      <h3 className="mb-2 font-display text-sm font-bold">Department contacts <span className="font-normal text-faint">each flag goes to its department by WhatsApp + email</span></h3>
      <div className="grid gap-1.5">
        {rows.map((dp, i) => (
          <div key={dp.key} className="flex flex-wrap items-center gap-2 border-b border-dashed border-line pb-1.5 last:border-0">
            <span className="w-40 text-[13px] font-semibold">{dp.name}</span>
            <Input className="w-44 py-1.5 text-xs" inputMode="tel" placeholder="WhatsApp number" value={dp.mobile ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, mobile: e.target.value } : x)))} />
            <Input className="w-56 py-1.5 text-xs" type="email" placeholder="email" value={dp.email ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
            <Badge tone={dp.mobile || dp.email ? "ok" : "muted"}>{dp.mobile || dp.email ? "reachable" : "no contact"}</Badge>
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save contacts"}</Button>
      {msg && <p className="mt-2 rounded-xl bg-paper p-2.5 text-xs text-muted">{msg}</p>}
    </Card>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-green-700" : "";
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`block font-display text-xl font-extrabold tabular-nums ${color}`}>{value}</span>
    </Card>
  );
}
