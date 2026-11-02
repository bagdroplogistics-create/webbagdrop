"use client";
/** BAGDROP OS · Network control tower — the animated layer above the moves
 *  calendar: KPI tiles that count up, an on-time ring, the at-risk feed,
 *  the city × day load heatmap and lane flow. Numbers come from
 *  src/lib/towerStats.ts; motion from the Motion library (motion/react),
 *  which honours the viewer's reduce-motion setting via MotionConfig. */
import { useEffect } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { inr } from "@/lib/pricing";
import type { Risk, TowerStats } from "@/lib/towerStats";

const MODE_NAME: Record<string, string> = { road: "Road", air: "Air", rail: "Rail", sea: "Sea" };
const ease = [0.22, 1, 0.36, 1] as const;

/** A number that counts to its new value instead of jumping. */
export function CountUp({ value, format = (n: number) => n.toLocaleString("en-IN") }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

function Tile({ i, label, children, sub, tone = "default", onClick }: {
  i: number; label: string; children: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "bad" | "good" | "warn"; onClick?: () => void;
}) {
  const ring = tone === "bad" ? "ring-red-200" : tone === "warn" ? "ring-amber-200" : tone === "good" ? "ring-green-200" : "ring-transparent";
  return (
    <motion.button type="button" onClick={onClick} disabled={!onClick}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.45, ease }}
      whileHover={onClick ? { y: -3, boxShadow: "0 10px 24px -12px rgba(15,23,42,.25)" } : undefined}
      className={`relative overflow-hidden rounded-2xl border border-line bg-white p-3.5 text-left ring-2 ${ring} ${onClick ? "cursor-pointer" : "cursor-default"}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className={`mt-1 block font-display text-[26px] font-extrabold leading-none tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700" : ""}`}>{children}</span>
      {sub && <span className="mt-1.5 block text-[11px] text-muted">{sub}</span>}
    </motion.button>
  );
}

function OnTimeRing({ pct }: { pct: number | null }) {
  const p = pct ?? 0;
  const color = pct === null ? "#cbd5e1" : p >= 95 ? "#16a34a" : p >= 85 ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 36 36" className="absolute right-3 top-3 size-11 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="4" />
      <motion.circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: p / 100 }} transition={{ duration: 1.1, ease }} />
    </svg>
  );
}

export function TowerTiles({ t, period, onRisks, onClubs }: { t: TowerStats; period: string; onRisks: () => void; onClubs: () => void }) {
  const reds = t.risks.filter((r) => r.severity === "red").length;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile i={0} label={`Moves · ${period}`} sub={<>{t.pickups} pickups · {t.linehauls} line-haul · {t.deliveries} deliveries{t.pending ? ` · ${t.pending} pending` : ""}</>}>
        <CountUp value={t.moves} />
      </Tile>
      <Tile i={1} label="Pieces" sub={t.xl ? <><b className="rounded bg-amber-100 px-1 text-amber-900">{t.xl} XL</b> oversize included</> : "no oversize"}>
        <CountUp value={t.pieces} />
      </Tile>
      <Tile i={2} label="On-time · 30 days" tone={t.onTimePct === null ? "default" : t.onTimePct >= 95 ? "good" : t.onTimePct >= 85 ? "warn" : "bad"}
        sub={t.onTimeBase ? `${t.onTimeBase} delivered with a promised date` : "no deliveries with a promised date yet"}>
        {t.onTimePct === null ? "—" : <CountUp value={t.onTimePct} format={(n) => `${n}%`} />}
        <OnTimeRing pct={t.onTimePct} />
      </Tile>
      <Tile i={3} label="At risk" tone={reds ? "bad" : t.risks.length ? "warn" : "good"} onClick={onRisks}
        sub={t.risks.length ? `${reds} critical · ${t.risks.length - reds} watch` : "nothing at risk"}>
        <CountUp value={t.risks.length} />
      </Tile>
      <Tile i={4} label="Clubbing savings" tone={t.savingOpen ? "warn" : "default"} onClick={onClubs}
        sub={`${t.clubsOpen} open${t.savingPlanned ? ` · ${inr(t.savingPlanned)} planned` : ""}`}>
        <CountUp value={t.savingOpen} format={(n) => inr(n)} />
      </Tile>
      <Tile i={5} label="Peak city load" tone={t.peakPct > 100 ? "bad" : t.peakPct >= 70 ? "warn" : "default"}
        sub={t.peakAt ? `${t.peakAt.city} · ${new Date(`${t.peakAt.day}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}` : "no city work in this period"}>
        <CountUp value={t.peakPct} format={(n) => `${n}%`} />
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper">
          <motion.span className="block h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, t.peakPct)}%` }}
            transition={{ duration: 0.9, ease }} style={{ background: t.peakPct > 100 ? "#b91c1c" : t.peakPct >= 90 ? "#ef4444" : t.peakPct >= 70 ? "#f59e0b" : "#22c55e" }} />
        </span>
      </Tile>
    </div>
  );
}

export function RiskFeed({ risks, onOpen, onDay }: { risks: Risk[]; onOpen: (id: string) => void; onDay: (day: string) => void }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold">
        At risk <span className="font-normal text-faint">{risks.length}</span>
        {risks.some((r) => r.severity === "red") && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-red-600" /></span>}
      </h3>
      {risks.length === 0 && <p className="rounded-xl bg-green-50 p-3 text-xs text-green-900">All clear — every move in view is assigned, confirmed and on time.</p>}
      <motion.ul layout className="max-h-72 space-y-1.5 overflow-auto pr-0.5">
        <AnimatePresence initial={false}>
          {risks.map((r) => (
            <motion.li key={r.key} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16, height: 0 }} transition={{ duration: 0.3, ease }}>
              <button onClick={() => (r.id ? onOpen(r.id) : onDay(r.date))}
                className={`w-full cursor-pointer rounded-xl border-l-4 border p-2 text-left text-xs transition-colors hover:bg-paper ${r.severity === "red" ? "border-red-300 border-l-red-500" : "border-amber-200 border-l-amber-400"}`}>
                <span className="flex items-center justify-between gap-2">
                  <b>{r.title}</b>
                  {r.id && <span className="font-mono text-[10px] text-muted">{r.id}</span>}
                </span>
                <span className="mt-0.5 block text-muted">{r.detail}</span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

const heatColor = (pct: number) =>
  pct === 0 ? "#f8fafc" : pct > 100 ? "#b91c1c" : pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : pct >= 40 ? "#4ade80" : "#bbf7d0";

export function LoadHeatmap({ t, today, onDay }: { t: TowerStats; today: string; onDay: (day: string) => void }) {
  const { cities, days, cells } = t.heat;
  if (!cities.length) return null;
  const at = (c: string, d: string) => cells.find((x) => x.city === c && x.day === d)!;
  const dense = days.length > 10;
  return (
    <div>
      <h3 className="mb-1 font-display text-sm font-bold">Network load <span className="font-normal text-faint">pickups + deliveries per city-day vs capacity</span></h3>
      <div className="overflow-x-auto">
        <div className="grid min-w-max gap-[3px]" style={{ gridTemplateColumns: `96px repeat(${days.length}, minmax(${dense ? 18 : 44}px, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d} className={`text-center text-[10px] ${d === today ? "font-bold text-brand" : "text-faint"}`}>
              {dense ? Number(d.slice(8)) : new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}
            </div>
          ))}
          {cities.map((c, ri) => (
            <div key={c} className="contents">
              <div className="truncate pr-2 text-right text-[11px] font-semibold leading-6">{c}</div>
              {days.map((d, ci) => {
                const cell = at(c, d);
                return (
                  <motion.button key={d} onClick={() => onDay(d)} title={`${c} · ${d} · ${cell.pieces} pcs · ${cell.pct}% of capacity`}
                    initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (ri * days.length + ci) * 0.006, duration: 0.3 }}
                    whileHover={{ scale: 1.12, zIndex: 2 }}
                    className={`h-6 cursor-pointer rounded-[5px] text-[9.5px] font-bold ${cell.pct >= 90 ? "text-white" : "text-slate-700"} ${d === today ? "ring-1 ring-brand" : ""}`}
                    style={{ background: heatColor(cell.pct) }}>
                    {cell.pieces && !dense ? cell.pieces : ""}
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
        {[["idle", 0], ["< 40%", 20], ["40–70%", 50], ["70–90%", 80], ["90–100%", 95], ["over", 120]].map(([n, p]) => (
          <span key={n} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm border border-line" style={{ background: heatColor(p as number) }} />{n}</span>
        ))}
      </div>
    </div>
  );
}

export function LaneFlowBars({ t }: { t: TowerStats }) {
  if (!t.lanes.length) return null;
  const max = Math.max(...t.lanes.map((l) => l.pieces));
  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-bold">Lane flow <span className="font-normal text-faint">top lanes by pieces</span></h3>
      <div className="space-y-1.5">
        {t.lanes.map((l, i) => (
          <div key={l.lane} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="truncate font-semibold">{l.lane} · {l.modes.map((m) => MODE_NAME[m] ?? m).join(" + ")}</span>
              <span className="shrink-0 tabular-nums text-muted">{l.pieces} pcs{l.xl ? ` (${l.xl} XL)` : ""} · {l.bookings} bkg</span>
            </div>
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-paper">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-brand"
                initial={{ width: 0 }} animate={{ width: `${(l.pieces / max) * 100}%` }} transition={{ delay: 0.1 + i * 0.06, duration: 0.8, ease }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
