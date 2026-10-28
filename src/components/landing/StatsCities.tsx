"use client";
import { useEffect, useRef, useState } from "react";
import { CITIES } from "./data";
import { Marquee, useCountUp } from "./motion";

const NUMERIC_STATS = [
  { target: 12000, suffix: "+", label: "Bags delivered" },
  { target: 50, suffix: "+", label: "Cities covered" },
  { target: 24, suffix: "h", label: "Advance booking" },
] as const;

function Stat({ target, suffix, label, active, brand }: { target: number; suffix: string; label: string; active: boolean; brand?: boolean }) {
  const v = useCountUp(target, active);
  return (
    <div className="flex flex-col gap-1.5 py-6">
      <span className={`font-display text-[clamp(2rem,4vw,2.75rem)] font-extrabold tracking-tight tabular-nums ${brand ? "text-brand" : "text-ink"}`}>
        {Math.round(v).toLocaleString("en-IN")}{suffix}
      </span>
      <span className="font-mono text-[11px] tracking-[0.14em] text-steel uppercase">{label}</span>
    </div>
  );
}

export default function StatsCities() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setActive(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div ref={ref} className="grid grid-cols-2 gap-x-6 divide-y divide-line border-y border-line sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
        {NUMERIC_STATS.map((s) => <div key={s.label} className="sm:px-6 sm:first:pl-0"><Stat {...s} active={active} /></div>)}
        <div className="py-6 sm:px-6">
          <span className="font-display text-[clamp(2rem,4vw,2.75rem)] font-extrabold tracking-tight text-brand">4.9 / 5</span>
          <span className="block font-mono text-[11px] tracking-[0.14em] text-steel uppercase">Customer rating</span>
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl bg-navy py-5 text-white">
        <Marquee durationS={32}>
          <div className="flex items-center">
            {CITIES.map((c) => (
              <span key={c} className="flex items-center gap-5 px-5 font-display text-xl font-extrabold tracking-tight whitespace-nowrap sm:text-2xl">
                {c.toUpperCase()} <span className="size-1.5 rounded-full bg-brand" />
              </span>
            ))}
          </div>
        </Marquee>
      </div>
    </section>
  );
}
