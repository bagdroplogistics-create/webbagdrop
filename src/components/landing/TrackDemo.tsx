"use client";
import { useState } from "react";
import { TRACK_DEMO_STEPS } from "./data";
import { Icon } from "./Icon";
import { Section, SectionHeading } from "./SectionHeading";

const PROOFS = ["Sealed", "Photographed", "Delivered"];

export default function TrackDemo() {
  const [step, setStep] = useState(2);
  const total = TRACK_DEMO_STEPS.length;

  return (
    <Section id="track" tone="canvas">
      <SectionHeading kicker="Track your bags" title="From your door" accent="to delivered." />

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">BOOKING ID · EXAMPLE</span>
            <span className="font-mono text-xl font-bold tracking-wider text-ink">BD-7K2Q9X</span>
          </div>
          <div className="flex flex-col gap-1 border-l border-line pl-4">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">ROUTE</span>
            <span className="text-[16px] font-semibold text-ink">Goa doorstep → Mumbai home</span>
          </div>
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) % total)}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Replay demo <Icon name="arrow" size={14} />
          </button>
        </div>

        <div className="px-6 py-8">
          <div className="relative">
            <div className="absolute left-0 right-0 top-[11px] h-px bg-line" aria-hidden="true" />
            <div
              className="absolute left-0 top-[11px] h-[2px] bg-brand transition-all duration-700"
              style={{ width: `${(step / (total - 1)) * 100}%` }}
              aria-hidden="true"
            />
            <div className="relative grid grid-cols-5 gap-2">
              {TRACK_DEMO_STEPS.map((s, i) => (
                <div key={s.l} className="flex flex-col gap-2">
                  <span className={`size-[11px] rounded-full ${i < step ? "bg-ink" : i === step ? "bg-brand ring-4 ring-brand-soft" : "bg-line"}`} />
                  <span className={`font-mono text-[11px] tracking-wider ${i <= step ? "text-brand" : "text-faint"}`}>{s.tag}</span>
                  <span className={`text-[14px] font-semibold leading-tight ${i <= step ? "text-ink" : "text-faint"}`}>{s.l}</span>
                  <span className="font-mono text-[12px] text-faint">{i <= step ? s.time : "--:--"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 border-t border-line sm:grid-cols-2">
          <div className="flex flex-col gap-3 px-6 py-6 sm:border-r sm:border-line">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">UPDATES SENT</span>
            {TRACK_DEMO_STEPS.slice(0, step + 1).reverse().map((e) => (
              <div key={e.l} className="flex gap-4 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <span className="w-12 shrink-0 font-mono text-[13px] font-semibold text-brand">{e.time}</span>
                <div className="flex flex-col">
                  <span className="text-[15px] font-semibold text-ink">{e.l}</span>
                  <span className="text-[14px] text-steel">{e.d}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 bg-paper/50 px-6 py-6">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">CUSTODY RECORD</span>
            <div className="grid grid-cols-3 gap-2">
              {PROOFS.map((label, i) => {
                const thresholds = [1, 1, 4];
                const met = step >= thresholds[i];
                return (
                  <div key={label} className={`flex flex-col gap-2 rounded-xl p-3 ${met ? "bg-ink text-white" : "bg-white text-faint"}`}>
                    <span className={`flex size-6 items-center justify-center rounded-full border-2 ${met ? "border-white" : "border-line"}`}>
                      {met && <Icon name="check" size={12} />}
                    </span>
                    <span className="text-[14px] font-semibold">{label}</span>
                  </div>
                );
              })}
            </div>
            <span className="mt-1 text-[13px] text-steel">WhatsApp &amp; email updates ship today. Live GPS tracking will be available soon.</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
