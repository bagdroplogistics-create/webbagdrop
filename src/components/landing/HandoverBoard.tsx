"use client";
import { useState } from "react";
import { HANDOVERS } from "./data";
import { Icon } from "./Icon";
import { Section, SectionHeading } from "./SectionHeading";

export default function HandoverBoard() {
  const [open, setOpen] = useState(0);

  return (
    <Section id="handovers">
      <SectionHeading kicker="Live board" title="Every terminal." accent="One handover." />

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-navy px-5 py-3.5 text-white">
          <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em]">
            <span className="size-1.5 rounded-full bg-brand" /> BAGDROP · HANDOVERS
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-white/70">ILLUSTRATIVE EXAMPLE</span>
        </div>

        <ul className="divide-y divide-line">
          {HANDOVERS.map((r, i) => {
            const isOpen = open === i;
            return (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors ${isOpen ? "bg-brand-soft" : "hover:bg-paper"}`}
                >
                  <span className="hidden font-mono text-[13px] font-semibold text-steel sm:block sm:w-14">{r.time}</span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon name={r.icon} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[15px] font-bold text-ink">{r.service}</span>
                    <span className="block truncate text-[13px] text-steel">{r.from} → {r.to}</span>
                  </span>
                  <span className="hidden font-mono text-[11px] tracking-wider text-faint sm:block">{r.code}</span>
                  <Icon name="arrow" size={16} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-4 bg-brand-soft/60 px-5 pb-5 pt-1 sm:gap-8 sm:pl-[4.75rem]">
                    {r.steps.map((s, si) => (
                      <div key={s} className="flex items-center gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-bold text-white">{si + 1}</span>
                        <span className="text-[13px] font-medium text-ink">{s}</span>
                        {si < r.steps.length - 1 && <Icon name="arrow" size={14} className="hidden text-faint sm:block" />}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-3 text-[13px] text-faint">Example routes shown for illustration — your handover plan is confirmed at booking.</p>
    </Section>
  );
}
