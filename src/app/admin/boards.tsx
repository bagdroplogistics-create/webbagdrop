"use client";
/** Executive dashboard boards — one component per department, shared by the
 *  admin Dashboard tab (src/app/admin/Executive.tsx) and the read-only
 *  department links (src/app/board/[token]). Every board gets the same
 *  depth: KPI row with vs-previous-period deltas, a 14-day trend, its own
 *  "needs attention" list, and drill-down links when rendered inside the
 *  Admin OS (onNav present). */
import { useEffect, useRef, useState } from "react";
import { inr } from "@/lib/pricing";
import type { Attention, Delta, Metrics, Trend, ViewKey } from "@/lib/metricsTypes";
import { VIEWS } from "@/lib/metricsTypes";
import { Badge, Button, Card } from "@/components/ui";

export type Nav = (module: string, bookingId?: string) => void;

/* ---------- animated number ---------- */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current; prev.current = value;
    if (from === value) return;
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setShown(value); return; }
    const t0 = performance.now(); const dur = 650;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur); const e = 1 - (1 - k) ** 3;
      setShown(Math.round(from + (value - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    /* background tabs never fire rAF — snap so the figure is always right */
    const snap = setTimeout(() => { cancelAnimationFrame(raf); setShown(value); }, dur + 150);
    return () => { cancelAnimationFrame(raf); clearTimeout(snap); };
  }, [value]);
  return <>{format ? format(shown) : shown.toLocaleString("en-IN")}</>;
}

/* ---------- KPI with delta chip ---------- */
export interface KpiSpec {
  label: string; value: number; format?: (n: number) => string; hint?: string;
  tone?: "ok" | "warn"; delta?: Delta; goodDown?: boolean; text?: string;
}

function DeltaChip({ d, goodDown }: { d: Delta; goodDown?: boolean }) {
  if (d.pct === null) return <span className="rounded-full bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-muted" title="No previous-period base">new</span>;
  const up = d.pct >= 0;
  const good = goodDown ? !up || d.pct === 0 : up;
  return (
    <span title={`Previous period: ${d.prev.toLocaleString("en-IN")}`}
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(d.pct)}%
    </span>
  );
}

export function Kpi({ k }: { k: KpiSpec }) {
  return (
    <Card className="min-w-0 !p-4">
      <span className="flex items-center justify-between gap-1 text-[11px] font-medium text-muted">
        {k.label}
        {k.delta && <DeltaChip d={k.delta} goodDown={k.goodDown} />}
      </span>
      <span className={`block font-display text-2xl font-extrabold tabular-nums ${k.tone === "warn" ? "text-amber-600" : k.tone === "ok" ? "text-green-700" : ""}`}>
        {k.text ?? <CountUp value={k.value} format={k.format} />}
      </span>
      {k.hint && <span className="block text-[11px] text-faint">{k.hint}</span>}
    </Card>
  );
}

export function KpiRow({ kpis }: { kpis: KpiSpec[] }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map((k) => <Kpi key={k.label} k={k} />)}</div>;
}

/** The headline KPIs of each board — one list drives the on-screen row, the
 *  WhatsApp/email digest and the PNG snapshot, so they never disagree. */
export function kpisFor(view: ViewKey, m: Metrics): KpiSpec[] {
  const pct = (n: number) => `${n}%`;
  if (view === "ceo") return [
    { label: `Collected · ${m.periodLabel}`, value: m.ceo.revenue, format: inr, hint: `incl. GST ${inr(m.ceo.gst)}`, delta: m.deltas.revenue },
    { label: "Bookings", value: m.ceo.bookings, hint: `${m.ceo.paidCount} paid`, delta: m.deltas.bookings },
    { label: "Billed value", value: m.ceo.billedValue, format: inr, delta: m.deltas.billedValue },
    { label: "Trip margin", value: m.ceo.marginPct ?? 0, text: m.ceo.marginPct === null ? "—" : undefined, format: pct, tone: m.ceo.marginPct !== null && m.ceo.marginPct < 40 ? "warn" : "ok" },
  ];
  if (view === "ops") return [
    { label: "In custody", value: m.ops.inCustody, hint: "picked up, not delivered" },
    { label: "Pickups today", value: m.ops.pickupsToday },
    { label: `Delivered · ${m.periodLabel}`, value: m.ops.deliveredInPeriod, hint: `${m.ops.deliveredTotal} all time`, delta: m.deltas.delivered },
    { label: "PODs pending", value: m.ops.podsPending, tone: m.ops.podsPending ? "warn" : "ok", goodDown: true },
  ];
  if (view === "fin") return [
    { label: `Collected · ${m.periodLabel}`, value: m.fin.collected, format: inr, delta: m.deltas.revenue },
    { label: "Billed value", value: m.fin.invoiced, format: inr, delta: m.deltas.billedValue },
    { label: "GST 5%", value: m.fin.gst, format: inr, hint: "GTA · SAC 9965", delta: m.deltas.gst },
    { label: "Unreconciled", value: m.fin.unreconAmount, format: inr, hint: `${m.fin.unreconCount} payments`, tone: m.fin.unreconCount ? "warn" : "ok" },
  ];
  if (view === "sales") return [
    { label: `Inquiries · ${m.periodLabel}`, value: m.sales.inquiries, hint: `${m.sales.inquiriesTotal} all time`, delta: m.deltas.inquiries },
    { label: "Conversion", value: m.sales.conversionPct ?? 0, text: m.sales.conversionPct === null ? "—" : undefined, format: pct, hint: "created → paid" },
    { label: "Pipeline", value: m.sales.pipelineValue, format: inr, hint: `${m.sales.pipelineCount} open quotes` },
    { label: "Overdue follow-ups", value: m.sales.overdueFollowups, tone: m.sales.overdueFollowups ? "warn" : "ok", goodDown: true },
  ];
  if (view === "comm") return [
    { label: "Avg realization", value: m.comm.avgPerBag, format: inr, hint: "per billed bag", delta: m.deltas.avgPerBag },
    { label: "Oversize share", value: m.comm.oversizeSharePct, format: pct, hint: inr(m.comm.oversizeRevenue) },
    { label: "Revised quotes", value: m.comm.revisedCount, tone: m.comm.revisedCount ? "warn" : "ok", goodDown: true },
    { label: "Active lanes", value: m.comm.lanes.length },
  ];
  return [
    { label: "Open events", value: m.wed.openEvents },
    { label: `New families · ${m.periodLabel}`, value: m.wed.newFamilies, delta: m.deltas.wedCreated, hint: `${m.wed.familyBookings} total` },
    { label: "Guests", value: m.wed.guests },
    { label: "Bags out", value: m.wed.bagsOut, hint: m.wed.noRoom ? `${m.wed.noRoom} guests without rooms` : undefined },
  ];
}

/* ---------- charts ---------- */
export function Spark({ days, forecast }: Metrics["series"]) {
  const vals = [...days.map((d) => d.revenue)];
  const max = Math.max(1, ...vals);
  const pMax = Math.max(1, ...days.map((d) => d.pieces), ...forecast.map((f) => f.hi));
  return (
    <div className="flex h-28 items-end gap-1" aria-label="Revenue, last 14 days">
      {days.map((d) => (
        <div key={d.day} className="group relative flex-1" title={`${d.day} · ${inr(d.revenue)} · ${d.pieces} pieces`}>
          <div className="rounded-t bg-brand/75 transition-[height] duration-500" style={{ height: `${Math.max(3, (d.revenue / max) * 100)}%` }} />
        </div>
      ))}
      {forecast.map((f) => (
        <div key={f.day} className="flex-1" title={`${f.day} · forecast ${f.mu} pieces (${f.lo}–${f.hi})`}>
          <div className="rounded-t border border-dashed border-brand/50 bg-brand/10" style={{ height: `${Math.max(3, (f.mu / pMax) * 60)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ t, money }: { t: Trend; money?: boolean }) {
  if (!t.days.length) return null;
  const max = Math.max(1, ...t.days.map((d) => d.v));
  const fmt = (v: number) => (money ? inr(v) : v.toLocaleString("en-IN"));
  const today = t.days[t.days.length - 1];
  return (
    <Card>
      <h3 className="mb-1 flex items-baseline justify-between font-display text-sm font-bold">
        {t.label}
        <span className="text-[11px] font-normal text-faint">peak {fmt(max)} · today {fmt(today.v)}</span>
      </h3>
      <div className="flex h-24 items-end gap-1" aria-label={t.label}>
        {t.days.map((d, i) => (
          <div key={d.day} className="flex-1" title={`${d.day} · ${fmt(d.v)}`}>
            <div className={`rounded-t transition-[height] duration-500 ${i === t.days.length - 1 ? "bg-brand" : "bg-brand/55"}`}
              style={{ height: `${Math.max(3, (d.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>{t.days[0]?.day.slice(5)}</span><span>today</span>
      </div>
    </Card>
  );
}

/* ---------- attention list ---------- */
export function AttentionCard({ items, onNav }: { items: Attention[]; onNav?: Nav }) {
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Needs attention</h3>
      {items.length === 0 && <p className="text-sm text-muted">Nothing. Clean board. ✅</p>}
      <ul className="space-y-1.5">
        {items.map((a, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs">
            <Badge tone="warn">act</Badge>
            <span className="text-muted">
              {a.text}
              {onNav && a.module && (
                <>
                  {" "}
                  <button type="button" className="cursor-pointer font-semibold text-brand hover:underline" onClick={() => onNav(a.module!, a.id)}>
                    {a.id ? `open ${a.id} →` : "open →"}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- per-department boards ---------- */
export function CeoBoard({ m, onNav }: { m: Metrics; onNav?: Nav }) {
  return (
    <>
      <KpiRow kpis={kpisFor("ceo", m)} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h3 className="mb-1 font-display text-sm font-bold">Revenue, last 14 days <span className="font-normal text-faint">dashed = pieces forecast, next 7</span></h3>
          <Spark {...m.series} />
        </Card>
        <AttentionCard items={m.attention.ceo} onNav={onNav} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {m.ceo.depts.map((d) => (
          <button key={d.key} onClick={() => onNav?.(d.key === "ops" ? "ship" : d.key === "sales" ? "crm" : d.key === "comm" ? "price" : d.key)}
            className="cursor-pointer rounded-2xl border border-line bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-lg">
            <span className="flex items-center justify-between font-display text-[13px] font-bold">{d.name} <i className={`size-2 rounded-full ${d.ok ? "bg-green-500" : "bg-amber-500"}`} /></span>
            <span className="mt-1 block text-[11px] text-muted">{d.note}</span>
            {onNav && <span className="mt-1.5 block text-[11px] font-semibold text-brand">Open board →</span>}
          </button>
        ))}
      </div>
    </>
  );
}

export function OpsBoard({ m, onNav }: { m: Metrics; onNav?: Nav }) {
  return (
    <>
      <KpiRow kpis={kpisFor("ops", m)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart t={m.trends.ops} />
        <AttentionCard items={m.attention.ops} onNav={onNav} />
      </div>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Trip P&amp;L <span className="font-normal text-faint">revenue − expenses, advances shown</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Trip</th><th>Route</th><th>Bookings</th><th className="text-right">Revenue</th><th className="text-right">Expenses</th><th className="text-right">Advances</th><th className="text-right">P&amp;L</th></tr></thead>
            <tbody>
              {m.ops.trips.length === 0 && <tr><td colSpan={7} className="py-2 text-muted">No trips yet.</td></tr>}
              {m.ops.trips.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-1.5 font-mono text-[11px]">{t.id}</td><td>{t.route}</td><td>{t.bookings}</td>
                  <td className="text-right tabular-nums">{inr(t.revenue)}</td><td className="text-right tabular-nums">{inr(t.expenses)}</td>
                  <td className="text-right tabular-nums text-muted">{inr(t.advances)}</td>
                  <td className={`text-right font-semibold tabular-nums ${t.pnl < 0 ? "text-red-600" : "text-green-700"}`}>{inr(t.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {onNav && <Button size="sm" variant="outline" className="mt-3" onClick={() => onNav("lr")}>Open LR &amp; trips →</Button>}
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Shipments by stage</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(m.ops.byStage).map(([st, n]) => <Badge key={st} tone={st === "delivered" ? "ok" : ["rejected", "cancelled"].includes(st) ? "bad" : "info"}>{st.replace("_", " ")} · {n}</Badge>)}
        </div>
      </Card>
    </>
  );
}

export function FinBoard({ m, onNav }: { m: Metrics; onNav?: Nav }) {
  return (
    <>
      <KpiRow kpis={kpisFor("fin", m)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart t={m.trends.fin} money />
        <AttentionCard items={m.attention.fin} onNav={onNav} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Receivables ageing <span className="font-normal text-faint">{inr(m.fin.receivableTotal)} across {m.fin.receivableCount}</span></h3>
          {m.fin.ageing.map((a) => {
            const maxA = Math.max(1, ...m.fin.ageing.map((x) => x.amount));
            return (
              <div key={a.bucket} className="mb-2">
                <div className="flex justify-between text-xs"><span className="text-muted">{a.bucket}</span><span className="font-semibold tabular-nums">{inr(a.amount)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-brand/70 transition-[width] duration-500" style={{ width: `${(a.amount / maxA) * 100}%` }} /></div>
              </div>
            );
          })}
        </Card>
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Document engine</h3>
          <p className="text-sm text-muted">{m.fin.docsCount} documents issued through the FY-numbered series (PI / INV / RCT / CSH / CV). Generate and reconcile in the Finance module.</p>
          {onNav && <Button size="sm" variant="outline" className="mt-3" onClick={() => onNav("fin")}>Open Finance →</Button>}
        </Card>
      </div>
    </>
  );
}

export function SalesBoard({ m, onNav }: { m: Metrics; onNav?: Nav }) {
  return (
    <>
      <KpiRow kpis={kpisFor("sales", m)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart t={m.trends.sales} />
        <AttentionCard items={m.attention.sales} onNav={onNav} />
      </div>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Where sales stands</h3>
        <p className="text-sm text-muted">
          {m.sales.rorPending > 0 ? `${m.sales.rorPending} rate-on-request route${m.sales.rorPending > 1 ? "s" : ""} waiting for a price — these are live customers asking to pay. ` : "No ROR routes waiting. "}
          {m.sales.overdueFollowups > 0 ? `${m.sales.overdueFollowups} follow-up${m.sales.overdueFollowups > 1 ? "s are" : " is"} past due in CRM.` : "Follow-ups are on time."}
        </p>
        {onNav && <Button size="sm" variant="outline" className="mt-3" onClick={() => onNav("crm")}>Open CRM →</Button>}
      </Card>
    </>
  );
}

export function CommBoard({ m, onNav }: { m: Metrics; onNav?: Nav }) {
  return (
    <>
      <KpiRow kpis={kpisFor("comm", m)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart t={m.trends.comm} money />
        <AttentionCard items={m.attention.comm} onNav={onNav} />
      </div>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Lane yield <span className="font-normal text-faint">paid bookings, top lanes</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Lane</th><th className="text-right">Bookings</th><th className="text-right">Bags</th><th className="text-right">Revenue</th><th className="text-right">₹ / bag</th></tr></thead>
            <tbody>
              {m.comm.lanes.length === 0 && <tr><td colSpan={5} className="py-2 text-muted">No paid bookings yet in this period.</td></tr>}
              {m.comm.lanes.map((l) => (
                <tr key={l.lane} className="border-t border-line">
                  <td className="py-1.5">{l.lane}</td><td className="text-right">{l.n}</td><td className="text-right">{l.bags}</td>
                  <td className="text-right font-semibold tabular-nums">{inr(l.revenue)}</td><td className="text-right tabular-nums">{inr(l.perBag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {onNav && <Button size="sm" variant="outline" className="mt-3" onClick={() => onNav("price")}>Open Pricing →</Button>}
      </Card>
    </>
  );
}

export function WedBoard({ m, onNav }: { m: Metrics; onNav?: Nav }) {
  return (
    <>
      <KpiRow kpis={kpisFor("wed", m)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart t={m.trends.wed} />
        <AttentionCard items={m.attention.wed} onNav={onNav} />
      </div>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Open events</h3>
        {m.wed.events.length === 0 && <p className="text-sm text-muted">No open events.</p>}
        <ul className="space-y-2">
          {m.wed.events.map((e) => (
            <li key={e.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-2 text-xs last:border-0">
              <span><b className="font-display">{e.name}</b> <span className="text-muted">· {e.venue}</span></span>
              <span className="text-muted">{e.dates.in} → {e.dates.out} · {e.families} families · <span className="font-mono">{e.code}</span></span>
            </li>
          ))}
        </ul>
        {onNav && <Button size="sm" variant="outline" className="mt-3" onClick={() => onNav("wed")}>Open Weddings →</Button>}
      </Card>
    </>
  );
}

export function Board({ view, m, onNav }: { view: ViewKey; m: Metrics; onNav?: Nav }) {
  if (view === "ceo") return <CeoBoard m={m} onNav={onNav} />;
  if (view === "ops") return <OpsBoard m={m} onNav={onNav} />;
  if (view === "fin") return <FinBoard m={m} onNav={onNav} />;
  if (view === "sales") return <SalesBoard m={m} onNav={onNav} />;
  if (view === "comm") return <CommBoard m={m} onNav={onNav} />;
  return <WedBoard m={m} onNav={onNav} />;
}

/* ---------- digest text (WhatsApp / email) ---------- */
export function digest(view: ViewKey, m: Metrics): { title: string; body: string } {
  const at = new Date(m.asOf).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const name = VIEWS.find((v) => v.key === view)?.name ?? view;
  const L: string[] = [`*BAGDROP · ${name}* — ${m.periodLabel}`, `_as of ${at}_`, ""];
  for (const k of kpisFor(view, m)) {
    const val = k.text ?? (k.format ? k.format(k.value) : k.value.toLocaleString("en-IN"));
    const d = k.delta && k.delta.pct !== null ? ` (${k.delta.pct >= 0 ? "▲" : "▼"}${Math.abs(k.delta.pct)}% vs prev)` : "";
    L.push(`${k.label}: ${val}${d}${k.hint ? ` · ${k.hint}` : ""}`);
  }
  const att = m.attention[view];
  if (att.length) { L.push("", "*Needs attention:*"); att.forEach((a) => L.push(`• ${a.text}`)); }
  else L.push("", "No exceptions. ✅");
  if (view === "comm" && m.comm.lanes.length) { L.push("", "*Top lanes:*"); m.comm.lanes.slice(0, 4).forEach((l) => L.push(`• ${l.lane} — ${inr(l.revenue)} (${l.bags} bags)`)); }
  if (view === "wed" && m.wed.events.length) { L.push("", "*Events:*"); m.wed.events.forEach((e) => L.push(`• ${e.name} (${e.code}) — ${e.families} families`)); }
  return { title: `Bagdrop ${name} — ${m.periodLabel}`, body: L.join("\n") };
}
