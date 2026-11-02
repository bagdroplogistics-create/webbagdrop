"use client";
import { useEffect, useRef, useState } from "react";
import { useCountUp } from "./motion";
import { useNow } from "@/lib/useNow";
import { CONTAINER } from "./SectionHeading";

const DAY_MS = 86_400_000;
/** Baseline for the "Bags delivered" counter — fixed, documented start
 *  point. Change neither without resetting the other: the displayed count
 *  is always BAGS_BASE at BAGS_START_DATE, +BAGS_DAILY_RATE per full
 *  calendar day since, forever (never random, never resets, never goes
 *  down). Day 1 → 12,012 · day 2 → 12,024 · day 10 → 12,120. */
const BAGS_BASE = 12000;
const BAGS_DAILY_RATE = 12;
const BAGS_START_DAY = Math.floor(Date.UTC(2026, 10, 2) / DAY_MS); // 2026-11-02

function bagsDelivered(now: number): number {
  const day = Math.floor(now / DAY_MS);
  const days = Math.max(0, day - BAGS_START_DAY);
  return BAGS_BASE + days * BAGS_DAILY_RATE;
}

function Stat({ target, suffix, label, active, brand }: { target: number; suffix: string; label: string; active: boolean; brand?: boolean }) {
  const v = useCountUp(target, active);
  return (
    <div className="flex flex-col gap-1.5 py-6">
      <span className={`font-display text-[clamp(2.2rem,4.4vw,3rem)] font-extrabold tracking-tight tabular-nums ${brand ? "text-brand" : "text-ink"}`}>
        {Math.round(v).toLocaleString("en-IN")}{suffix}
      </span>
      <span className="font-mono text-[12px] tracking-[0.14em] text-steel uppercase">{label}</span>
    </div>
  );
}

export default function StatsCities() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const now = useNow();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setActive(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const numericStats = [
    { target: bagsDelivered(now ?? BAGS_START_DAY * DAY_MS), suffix: "+", label: "Bags delivered" },
    { target: 50, suffix: "+", label: "Cities covered" },
    { target: 24, suffix: "h", label: "Advance booking" },
  ] as const;

  return (
    <section className="bg-section py-12 sm:py-16">
      <div className={CONTAINER}>
        <div ref={ref} className="grid grid-cols-2 gap-x-6 divide-y divide-line border-y border-line sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
          {numericStats.map((s) => <div key={s.label} className="sm:px-6 sm:first:pl-0"><Stat {...s} active={active} /></div>)}
          <div className="py-6 sm:px-6">
            <span className="font-display text-[clamp(2.2rem,4.4vw,3rem)] font-extrabold tracking-tight text-brand">4.9 / 5</span>
            <span className="block font-mono text-[12px] tracking-[0.14em] text-steel uppercase">Customer rating</span>
          </div>
        </div>
      </div>
    </section>
  );
}
