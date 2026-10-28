"use client";
/** The live departures-style board from the Motion Base mockup, rebuilt
 *  with the same content and motion: a six-row board whose status
 *  letters flip in when they change, a selected venue's zone-by-zone
 *  handover diagram with a continuously walking dot along the route, and
 *  (same as the mockup) status cycles ambiently over time. Clicking a
 *  row also selects it for the diagram below and nudges every row's
 *  status forward a step, so the board visibly reacts to the click. */
import { useEffect, useRef, useState } from "react";
import { BOARD_STATUSES, HANDOVERS } from "./data";
import { Icon } from "./Icon";
import { Section, SectionHeading } from "./SectionHeading";

const STATUS_FG: Record<string, string> = {
  BOOKED: "text-white/60",
  "PICKED UP": "text-white",
  "IN TRANSIT": "text-brand",
  DELIVERED: "text-emerald-400",
};
const ROW_GRID = "grid-cols-[56px_64px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_150px] sm:grid-cols-[64px_72px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_170px]";
const MAX_LEN = Math.max(...BOARD_STATUSES.map((s) => s.length));

function FlipStatus({ status, tone }: { status: string; tone: string }) {
  const padded = status.padEnd(MAX_LEN, " ");
  return (
    <span className={`flex gap-[1px] font-mono text-[11px] font-semibold tracking-wider ${tone}`} style={{ perspective: "300px" }}>
      {padded.split("").map((c, i) => (
        <span key={`${status}-${i}`} className="bd-flip-char flex h-6 w-[11px] items-center justify-center" style={{ animationDelay: `${i * 35}ms` }}>
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}

export default function HandoverBoard() {
  const [stage, setStage] = useState(0);
  const [venue, setVenue] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    timer.current = setInterval(() => setStage((s) => (s + 1) % BOARD_STATUSES.length), 2600);
    return () => clearInterval(timer.current);
  }, []);

  const v = HANDOVERS[venue];

  return (
    <Section id="handovers" tone="paper">
      <SectionHeading kicker="Live board" title="Every terminal." accent="One handover." />

      <div className="overflow-hidden rounded-2xl border border-line bg-navy text-white">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em]">
            <span className="bd-blink-dot size-1.5 rounded-full bg-brand" /> BAGDROP · HANDOVERS
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-white/70">ILLUSTRATIVE EXAMPLE</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`grid ${ROW_GRID} gap-3 border-b border-white/10 px-5 py-2.5 font-mono text-[10px] tracking-[0.16em] text-white/40 sm:gap-4`}>
              <span>TIME</span><span>CODE</span><span>SERVICE</span><span>FROM</span><span>TO</span><span>STATUS</span>
            </div>
            {HANDOVERS.map((r, i) => {
              const status = BOARD_STATUSES[(stage + i) % BOARD_STATUSES.length];
              const isSel = venue === i;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => { setVenue(i); setStage((s) => (s + 1) % BOARD_STATUSES.length); }}
                  className={`grid w-full ${ROW_GRID} items-center gap-3 border-b border-white/10 px-5 py-3.5 text-left transition-colors last:border-b-0 sm:gap-4 ${isSel ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <span className="font-mono text-[14px] font-semibold text-amber-300">{r.time}</span>
                  <span className="font-mono text-[12px] tracking-wider text-white/50">{r.code}</span>
                  <span className="flex items-center gap-2.5 truncate text-[14px] font-bold">
                    <Icon name={r.icon} size={17} className="shrink-0 text-white/70" /> <span className="truncate">{r.service}</span>
                  </span>
                  <span className="hidden truncate text-[13px] text-white/60 sm:block">{r.from}</span>
                  <span className="hidden truncate text-[13px] text-white/60 sm:block">{r.to}</span>
                  <FlipStatus status={status} tone={STATUS_FG[status]} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 bg-white text-ink lg:grid-cols-2">
          <div className="flex flex-col gap-4 border-b border-line p-6 lg:border-b-0 lg:border-r lg:p-8">
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-brand">LAYOUT · {v.kicker}</span>
            <h3 className="font-display text-[clamp(1.4rem,2.2vw,1.9rem)] font-extrabold leading-tight tracking-tight text-balance">{v.title}</h3>
            <p className="text-[14px] leading-relaxed text-graphite">{v.body}</p>
            <div className="mt-1 flex flex-wrap gap-4 font-mono text-[10px] tracking-[0.14em] text-steel">
              <span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-brand" /> BAGDROP POINT</span>
              <span className="flex items-center gap-2"><span className="size-3 rounded-sm border-2 border-dashed border-faint" /> SKIPPED</span>
              <span className="flex items-center gap-2"><span className="size-3 rounded-sm border-2 border-ink" /> YOU WALK</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 bg-paper/60 p-6 lg:p-8">
            <div className="relative h-4">
              <div className="absolute inset-x-0 top-[7px] h-0.5 bg-[repeating-linear-gradient(90deg,var(--color-ink)_0_8px,transparent_8px_14px)]" />
              <span key={venue} className="bd-walk-dot absolute top-0 size-4 rounded-full border-2 border-ink bg-brand" />
            </div>
            <div className="grid grid-cols-5 gap-2">
              {v.zones.map((z, i) => (
                <div
                  key={z.label + i}
                  className={`flex min-h-[110px] flex-col justify-between gap-2 rounded-lg p-2.5 text-[11px] font-semibold leading-tight ${
                    z.kind === "bd" ? "bg-brand text-white" : z.kind === "skip" ? "border-2 border-dashed border-faint text-faint" : "border-2 border-ink bg-white text-ink"
                  }`}
                >
                  <span className="font-mono text-[9px] font-normal opacity-70">{String(i + 1).padStart(2, "0")}</span>
                  <span className={z.kind === "skip" ? "line-through" : ""}>{z.label}</span>
                  <span className="font-mono text-[8px] tracking-wider opacity-80">{z.kind === "bd" ? "BAGDROP" : z.kind === "skip" ? "SKIPPED" : "YOU WALK"}</span>
                </div>
              ))}
            </div>
            <span className="font-mono text-[11px] tracking-[0.1em] text-graphite">{v.foot}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
