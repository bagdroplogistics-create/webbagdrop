"use client";
/** Pricing engine · the route rate chart as a proper data table.
 *
 *  Grouped headers (Route · Team rate · Customer pays · Bulk · Margin ·
 *  Instant · Note), sticky header and route column, right-aligned figures,
 *  a status stripe + inline problems on each row, sort by any column, a
 *  city search and attention / instant / one-way filters, and a totals
 *  footer. Editing stays inline: the rates are small fields; the lane
 *  (cities, direction) opens with "edit". Nothing here changes a price
 *  until the draft is published (Pricing.tsx). */
import { useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { hasReturn, laneName, marginAt, priceFor, type Issue } from "@/lib/pricingRules";
import type { CostModel } from "@/lib/opsModel";
import type { City, InstantAll, RouteRate } from "@/lib/types";
import { Badge, Button, Input, Select } from "@/components/ui";
import { DEFAULT_RULE } from "./PricingTools";

type SortKey = "lane" | "r1" | "r2" | "addl" | "pay1" | "pay2" | "pay3" | "bulkMin" | "bulkRate" | "m1" | "m2" | "instant" | "status";
type Filter = "all" | "attention" | "instant" | "noreturn";
const FILTERS: { key: Filter; name: string }[] = [
  { key: "all", name: "All routes" }, { key: "attention", name: "Needs attention" }, { key: "instant", name: "Instant on" }, { key: "noreturn", name: "Missing return" },
];
const GROUPS: { name: string; cols: number; tone: string }[] = [
  { name: "Route", cols: 1, tone: "border-ink" },
  { name: "Team rate · before GST", cols: 3, tone: "border-brand" },
  { name: "Customer pays · GST incl.", cols: 3, tone: "border-[#1F5FA8]" },
  { name: "Bulk", cols: 2, tone: "border-[#B7791F]" },
  { name: "Margin", cols: 2, tone: "border-[#1E7F4F]" },
  { name: "Instant booking", cols: 1, tone: "border-ink" },
  { name: "Note", cols: 2, tone: "border-line" },
];
const HEADS: { key: SortKey | null; name: string; right?: boolean; w?: string }[] = [
  { key: "lane", name: "Lane", w: "min-w-[220px]" },
  { key: "r1", name: "1 bag", right: true }, { key: "r2", name: "2 bags", right: true }, { key: "addl", name: "each extra", right: true },
  { key: "pay1", name: "1 bag", right: true }, { key: "pay2", name: "2 bags", right: true }, { key: "pay3", name: "3 bags", right: true },
  { key: "bulkMin", name: "from (bags)", right: true }, { key: "bulkRate", name: "₹ per bag", right: true },
  { key: "m1", name: "1 bag", right: true }, { key: "m2", name: "2 bags", right: true },
  { key: "instant", name: "" },
  { key: null, name: "" }, { key: null, name: "" },
];


const tone = (m: number, target: number): "ok" | "warn" | "bad" => (m >= target ? "ok" : m >= target - 10 ? "warn" : "bad");

function Num({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  return <Input className="w-[88px] !px-2 !py-1.5 text-right tabular-nums" type="number" inputMode="numeric" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
}
function CitySelect({ cities, value, onChange }: { cities: City[]; value: string; onChange: (v: string) => void }) {
  const names = [...new Set(cities.map((c) => c.name))];
  return (
    <Select className="w-36 !px-2 !py-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
      {!names.includes(value) && <option value={value}>{value || "— choose —"}{value ? " (not in city list)" : ""}</option>}
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
    </Select>
  );
}

export default function RateChart({ routes, issues, cities, costModel, all, locked, onSet, onRemove, onInstantAll, onOpenLimits, oversize, onOversize, liveVersion }: {
  routes: RouteRate[]; issues: Issue[]; cities: City[]; costModel: CostModel; all: InstantAll | null; locked: boolean;
  onSet: (i: number, patch: Partial<RouteRate>) => void; onRemove: (i: number) => void;
  onInstantAll: (a: InstantAll) => void; onOpenLimits: (i: number) => void;
  oversize: number; onOversize: (v: number) => void; liveVersion: number;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "lane", dir: 1 });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  const rows = useMemo(() => routes.map((r, i) => {
    const lane = laneName(r);
    const mine = issues.filter((x) => x.lane === lane);
    const errs = mine.filter((x) => x.level === "error").length, warns = mine.length - errs;
    const mode = all ? (r.instantMode ?? "off") : r.instant?.enabled ? "own" : "off";
    return {
      i, r, lane, mine, errs, warns, mode, on: mode !== "off",
      pay1: priceFor(r, 1), pay2: priceFor(r, 2), pay3: priceFor(r, 3),
      m1: marginAt(r, 1, costModel), m2: marginAt(r, 2, costModel),
      noReturn: r.dir !== "both" && !hasReturn(routes, r),
    };
  }), [routes, issues, costModel, all]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((x) =>
      (filter === "all" || (filter === "attention" ? x.mine.length > 0 : filter === "instant" ? x.on : x.noReturn))
      && (!needle || x.lane.toLowerCase().includes(needle) || (x.r.note ?? "").toLowerCase().includes(needle)));
    const v = (x: (typeof rows)[number]): number | string => sort.key === "lane" ? x.lane : sort.key === "status" ? x.errs * 10 + x.warns
      : sort.key === "instant" ? (x.on ? 1 : 0) : sort.key === "bulkMin" ? x.r.bulkMin ?? -1 : sort.key === "bulkRate" ? x.r.bulkRate ?? -1
      : sort.key === "r1" || sort.key === "r2" || sort.key === "addl" ? x.r[sort.key] : x[sort.key];
    return [...list].sort((a, b) => { const A = v(a), B = v(b); return (typeof A === "string" && typeof B === "string" ? A.localeCompare(B) : Number(A) - Number(B)) * sort.dir; });
  }, [rows, filter, q, sort]);

  const totals = useMemo(() => {
    const n = rows.length || 1;
    return {
      routes: rows.length, instant: rows.filter((x) => x.on).length, twoWay: rows.filter((x) => x.r.dir === "both").length,
      errs: rows.reduce((s, x) => s + x.errs, 0), warns: rows.reduce((s, x) => s + x.warns, 0),
      m1: Math.round(rows.reduce((s, x) => s + x.m1, 0) / n), m2: Math.round(rows.reduce((s, x) => s + x.m2, 0) / n),
      pay1: Math.round(rows.reduce((s, x) => s + (x.pay1 || 0), 0) / n), pay2: Math.round(rows.reduce((s, x) => s + (x.pay2 || 0), 0) / n),
    };
  }, [rows]);

  const head = (h: (typeof HEADS)[number], k: number) => {
    const active = h.key && sort.key === h.key;
    return (
      <th key={k} className={`whitespace-nowrap px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${h.right ? "text-right" : "text-left"} ${h.w ?? ""} ${k === 0 ? "sticky left-0 z-20 bg-white" : ""}`}>
        {h.key ? (
          <button type="button" className={`cursor-pointer hover:text-ink ${active ? "text-ink" : "text-faint"}`}
            onClick={() => setSort((s) => ({ key: h.key as SortKey, dir: s.key === h.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
            {h.name}{active ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
          </button>
        ) : <span className="text-faint">{h.name}</span>}
      </th>
    );
  };

  return (
    <div>
      {/* toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = f.key === "all" ? rows.length : f.key === "attention" ? rows.filter((x) => x.mine.length).length : f.key === "instant" ? totals.instant : rows.filter((x) => x.noReturn).length;
            return (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${filter === f.key ? "text-white" : "hover:opacity-80"}`}
                style={filter === f.key ? { background: "var(--a-navy)" } : { background: "var(--a-surface-2)", color: "var(--a-muted)" }}>
                {f.name} {n}
              </button>
            );
          })}
        </div>
        <Input className="ml-auto w-48 !py-1.5" placeholder="Find a city or note" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="cursor-pointer text-xs text-muted underline" onClick={() => setSort((s) => ({ key: "status", dir: s.key === "status" ? (s.dir === 1 ? -1 : 1) : -1 }))}>Problems first</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              {GROUPS.map((g, k) => (
                <th key={k} colSpan={g.cols} className={`border-b-2 px-2 pb-1 pt-2 text-left text-[10.5px] font-bold uppercase tracking-wider text-ink ${g.tone} ${k === 0 ? "sticky left-0 z-20 bg-white" : ""}`}>{g.name}</th>
              ))}
            </tr>
            <tr className="border-b border-line">{HEADS.map(head)}</tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={14} className="px-3 py-6 text-center text-muted">No routes match.</td></tr>}
            {shown.map((x) => {
              const { r, i } = x;
              const stripe = x.errs ? "border-l-[3px] border-l-[#C0392B]" : x.warns ? "border-l-[3px] border-l-[#B7791F]" : "border-l-[3px] border-l-[#1E7F4F]";
              const dim = locked ? "opacity-70" : "";
              return [
                <tr key={`r${i}`} className={`group border-b border-line align-middle hover:bg-paper ${x.errs ? "bg-red-50/40" : ""} ${dim}`}>
                  <td className={`sticky left-0 z-[5] bg-white px-2 py-1.5 group-hover:bg-paper ${stripe} ${x.errs ? "!bg-red-50" : ""}`}>
                    {editing === i ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <CitySelect cities={cities} value={r.from} onChange={(v) => onSet(i, { from: v })} />
                        <Select className="w-24 !px-2 !py-1.5" value={r.dir} onChange={(e) => onSet(i, { dir: e.target.value as RouteRate["dir"] })}><option value="both">both ways</option><option value="one">one way</option></Select>
                        <CitySelect cities={cities} value={r.to} onChange={(v) => onSet(i, { to: v })} />
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>done</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold text-ink">{r.from || "—"} <span className="text-faint">{r.dir === "both" ? "↔" : "→"}</span> {r.to || "—"}</div>
                          <div className="text-[10.5px] text-faint">{r.dir === "both" ? "both ways" : "one way"}{x.noReturn ? " · no return route" : ""}{x.mine.length ? ` · ${x.errs ? `${x.errs} error${x.errs === 1 ? "" : "s"}` : ""}${x.errs && x.warns ? ", " : ""}${x.warns ? `${x.warns} check${x.warns === 1 ? "" : "s"}` : ""}` : ""}</div>
                        </div>
                        {!locked && <button type="button" className="ml-auto cursor-pointer text-[11px] text-muted hover:underline" onClick={() => setEditing(i)}>edit</button>}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right"><Num disabled={locked} value={r.r1} onChange={(v) => onSet(i, { r1: v ?? 0 })} /></td>
                  <td className="px-2 py-1.5 text-right"><Num disabled={locked} value={r.r2} onChange={(v) => onSet(i, { r2: v ?? 0 })} /></td>
                  <td className="px-2 py-1.5 text-right"><Num disabled={locked} value={r.addl} onChange={(v) => onSet(i, { addl: v ?? 0 })} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number.isNaN(x.pay1) ? "—" : inr(x.pay1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number.isNaN(x.pay2) ? "—" : inr(x.pay2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number.isNaN(x.pay3) ? "—" : inr(x.pay3)}</td>
                  <td className="px-2 py-1.5 text-right"><Num disabled={locked} value={r.bulkMin ?? null} onChange={(v) => onSet(i, { bulkMin: v })} /></td>
                  <td className="px-2 py-1.5 text-right"><Num disabled={locked} value={r.bulkRate ?? null} onChange={(v) => onSet(i, { bulkRate: v })} /></td>
                  <td className="px-2 py-1.5 text-right"><Badge tone={tone(x.m1, costModel.marginFloorPct)}>{x.m1}%</Badge></td>
                  <td className="px-2 py-1.5 text-right"><Badge tone={tone(x.m2, costModel.marginFloorPct)}>{x.m2}%</Badge></td>
                  <td className="px-2 py-1.5">
                    <span className="flex flex-wrap items-center gap-1">
                      <button type="button" disabled={locked} aria-pressed={x.on} title={x.on ? "Instant: confirmed when paid, within the rule" : "Off: every booking waits for approval in BAGDROP OS"}
                        onClick={() => { if (!all) onInstantAll({ enabled: true, rule: DEFAULT_RULE }); onSet(i, { instantMode: x.on ? "off" : "default" }); }}
                        className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-bold ${x.on ? "bg-green-600 text-white" : "bg-paper text-muted ring-1 ring-line"}`}>{x.on ? "ON" : "OFF"}</button>
                      {x.on && all && (
                        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted">
                          <input type="checkbox" disabled={locked} checked={x.mode === "own"} onChange={(e) => { onSet(i, { instantMode: e.target.checked ? "own" : "default", ...(e.target.checked && !r.instant ? { instant: { ...all.rule, enabled: true } } : {}) }); if (e.target.checked) onOpenLimits(i); }} />own limits
                        </label>
                      )}
                      {x.on && x.mode === "own" && <Button size="sm" variant="ghost" onClick={() => onOpenLimits(i)}>limits</Button>}
                      {x.on && all && !all.enabled && <span className="text-[11px] text-amber-700">paused</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5"><Input className="w-40 !px-2 !py-1.5" disabled={locked} value={r.note ?? ""} placeholder="e.g. Goa Airport" onChange={(e) => onSet(i, { note: e.target.value })} /></td>
                  <td className="px-2 py-1.5 text-right">{!locked && <button type="button" className="cursor-pointer whitespace-nowrap text-[11px] text-red-700 hover:underline" onClick={() => { if (confirm(`Remove ${x.lane} from the draft?`)) onRemove(i); }}>remove</button>}</td>
                </tr>,
                x.mine.length ? (
                  <tr key={`p${i}`} className="border-b border-line">
                    <td className="sticky left-0 z-[5] bg-white" />
                    <td colSpan={13} className="px-2 pb-2 pt-0">
                      <ul className="grid gap-1">
                        {x.mine.map((m, k) => <li key={k} className={`rounded-md px-2 py-1 text-[11px] ${m.level === "error" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}><b>{m.level === "error" ? "Error" : "Check"}</b> · {m.msg}</li>)}
                      </ul>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-paper text-[11px] text-muted">
              <td className="sticky left-0 z-[5] bg-paper px-2 py-2 font-semibold text-ink">{totals.routes} route{totals.routes === 1 ? "" : "s"} <span className="font-normal text-muted">· {totals.twoWay} both ways · version {liveVersion}</span></td>
              <td colSpan={3} className="px-2 py-2 text-right">oversize add-on <Num disabled={locked} value={oversize} onChange={(v) => onOversize(v ?? 0)} /></td>
              <td className="px-2 py-2 text-right tabular-nums">avg {inr(totals.pay1)}</td>
              <td className="px-2 py-2 text-right tabular-nums">avg {inr(totals.pay2)}</td>
              <td />
              <td colSpan={2} className="px-2 py-2 text-right">{totals.errs ? <Badge tone="bad">{totals.errs} error{totals.errs === 1 ? "" : "s"}</Badge> : null} {totals.warns ? <Badge tone="warn">{totals.warns} check{totals.warns === 1 ? "" : "s"}</Badge> : null}{!totals.errs && !totals.warns ? <Badge tone="ok">all checks pass</Badge> : null}</td>
              <td className="px-2 py-2 text-right tabular-nums">avg {totals.m1}%</td>
              <td className="px-2 py-2 text-right tabular-nums">avg {totals.m2}%</td>
              <td className="px-2 py-2">{totals.instant} of {totals.routes} on</td>
              <td colSpan={2} className="px-2 py-2 text-right">target margin {costModel.marginFloorPct}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

