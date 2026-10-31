"use client";
import { useState } from "react";
import Link from "next/link";
import { TRACK_DEMO_STEPS } from "./data";
import { Icon } from "./Icon";
import { Section, SectionHeading } from "./SectionHeading";

const PROOFS: { label: string; icon: string }[] = [
  { label: "Sealed", icon: "lock" },
  { label: "Photographed", icon: "camera" },
  { label: "Delivered", icon: "box" },
];

export default function TrackDemo() {
  const [step, setStep] = useState(2);
  const total = TRACK_DEMO_STEPS.length;
  const pct = (step / (total - 1)) * 100;

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
          <div className="flex flex-col gap-1 border-l border-line pl-4">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">BAGS</span>
            <span className="text-[16px] font-semibold text-ink">3 · Sealed</span>
          </div>
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) % total)}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Track Bags <Icon name="arrow" size={14} />
          </button>
        </div>

        <div className="px-6 pb-8 pt-10">
          <div className="relative mb-6 h-7">
            <div className="absolute inset-x-0 top-[13px] h-0.5 bg-[repeating-linear-gradient(90deg,var(--color-line)_0_8px,transparent_8px_14px)]" />
            <div className="absolute left-0 top-[12px] h-[3px] bg-brand transition-all duration-[1400ms] ease-out" style={{ width: `${pct}%` }} />
            <span
              className="absolute top-0 flex size-7 items-center justify-center rounded-full bg-navy text-white shadow-card transition-all duration-[1400ms] ease-out"
              style={{ left: `calc(${pct}% - ${(pct / 100) * 28}px)` }}
            >
              <Icon name="landing" size={15} />
            </span>
          </div>
          <div className="relative grid grid-cols-5 gap-2">
            {TRACK_DEMO_STEPS.map((s, i) => (
              <div key={s.l} className="flex flex-col gap-2">
                <span className={`size-[11px] rounded-full ${i < step ? "bg-ink" : i === step ? "bg-brand ring-4 ring-brand-soft" : "bg-line"}`} />
                <span className={`font-mono text-[11px] tracking-wider ${i === step ? "text-brand" : i < step ? "text-steel" : "text-faint"}`}>{s.tag}</span>
                <span className={`text-[14px] font-semibold leading-tight ${i <= step ? "text-ink" : "text-faint"}`}>{s.l}</span>
                <span className="font-mono text-[12px] text-faint">{i <= step ? s.time : "--:--"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 border-t border-line sm:grid-cols-2">
          <div className="flex flex-col gap-3 px-6 py-6 sm:border-r sm:border-line">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">UPDATES SENT</span>
            {TRACK_DEMO_STEPS.slice(0, step + 1).reverse().map((e) => (
              <div key={e.l} className="flex gap-4 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <span className="w-12 shrink-0 font-mono text-[13px] font-semibold text-navy">{e.time}</span>
                <div className="flex flex-col">
                  <span className="text-[15px] font-semibold text-ink">{e.l}</span>
                  <span className="text-[14px] text-steel">{e.d}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 bg-section px-6 py-6">
            <span className="font-mono text-[11px] tracking-[0.18em] text-faint">CUSTODY RECORD</span>
            <div className="grid grid-cols-3 gap-2">
              {PROOFS.map(({ label, icon }, i) => {
                const thresholds = [1, 1, 4];
                const met = step >= thresholds[i];
                return (
                  <div key={label} className={`flex flex-col gap-2 rounded-xl p-3 ${met ? "bg-ink text-white" : "bg-white text-faint"}`}>
                    <span className={`flex size-7 items-center justify-center rounded-full border-2 ${met ? "border-white/30 bg-white/10" : "border-line"}`}>
                      <Icon name={icon} size={14} />
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

      {/* the real thing: every booking for the customer's mobile or email */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/30 bg-brand-soft px-6 py-5">
        <div className="flex flex-col gap-1">
          <span className="text-[17px] font-semibold text-ink">Already booked? Track your real booking.</span>
          <span className="text-[14px] text-steel">Sign in with the mobile or email you booked with: see its status, pay, add bags or sign the baggage bond.</span>
        </div>
        <Link href="/account" className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-dark">
          Track my booking <Icon name="arrow" size={14} />
        </Link>
      </div>
    </Section>
  );
}
