"use client";
/** The hero — a 4-step motion slider (Book / Pickup / Transit / Delivered),
 *  same four steps as the Motion Base mockup's "scroll story" hero.
 *  Implemented as a self-contained, auto-advancing slider instead of that
 *  mockup's 340vh pinned scroll-jack: a multi-screen-tall pinned section
 *  fights the page's own scroll and degrades badly on mobile, which the
 *  rest of this rebuild has deliberately avoided (see the write-up on the
 *  departures-board and tracking sections). The motion and the 4 steps
 *  are the same; only the scroll-hijacking mechanism is dropped. */
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { STORY_STEPS } from "./data";
import { Icon } from "./Icon";
import { Reveal } from "./motion";
import { CONTAINER } from "./SectionHeading";

const STEP_MS = 4200;

export default function Hero() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = STORY_STEPS.length;
  const active = STORY_STEPS[step];
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || paused) return;
    timer.current = setInterval(() => setStep((s) => (s + 1) % total), STEP_MS);
    return () => clearInterval(timer.current);
  }, [paused, total]);

  return (
    <section id="top" className={`pt-10 pb-12 sm:pt-14 sm:pb-16 ${CONTAINER}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="flex flex-col gap-6">
          {/* Step progress — 4 segments, click to jump, fills while active */}
          <div className="flex gap-1.5">
            {STORY_STEPS.map((s, i) => (
              <button key={s.n} type="button" aria-label={`Step ${s.n}: ${s.tag}`} onClick={() => setStep(i)} className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
                <span
                  key={i === step ? `${step}-active` : i < step ? "done" : "todo"}
                  className={`block h-full origin-left bg-brand ${i < step ? "w-full" : i === step ? "bd-seg-fill w-full" : "w-0"}`}
                  style={i === step ? { animationDuration: `${STEP_MS}ms` } : undefined}
                />
              </button>
            ))}
          </div>

          <div key={step} className="bd-step-in flex items-center gap-2.5 font-mono text-[11px] font-semibold tracking-[0.25em] text-brand">
            <span className="h-[3px] w-10 bg-brand" /> {active.n} · {active.tag}
          </div>

          <h1 key={`h-${step}`} className="bd-step-in font-display text-[clamp(2.4rem,5.2vw,3.75rem)] font-extrabold leading-[0.98] tracking-tight text-ink text-balance">
            {active.a}<br />
            <span className="text-brand">{active.b}</span>
          </h1>
          <p key={`d-${step}`} className="bd-step-in max-w-lg text-[17px] leading-relaxed text-graphite">
            {active.d}
          </p>

          <Reveal delay={240} className="flex flex-wrap gap-3">
            <a href="#book" className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
              Book a Pickup <Icon name="arrow" size={16} />
            </a>
            <a href="#how" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:border-ink/30">
              See how it works
            </a>
          </Reveal>
          <Reveal delay={320} className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-[12px] tracking-wide text-graphite">
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-brand" /> 12,000+ bags delivered</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-brand" /> 2–3 day delivery</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-brand" /> Fully insured</span>
          </Reveal>
        </div>

        <Reveal delay={200} className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-navy sm:aspect-[5/6] lg:aspect-[4/5]">
            <Image src="/images/web-slider.jpg" alt="Traveler walking through an airport terminal without luggage" fill sizes="(min-width:1024px) 40vw, 90vw" className="object-cover opacity-90" priority />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-navy/5 to-transparent" />
          </div>

          <div className="absolute inset-x-4 -bottom-6 overflow-hidden rounded-2xl border border-line bg-white shadow-card-lg sm:inset-x-6 sm:-bottom-8">
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-[10px] tracking-[0.14em] text-faint">
              <span>YOUR DOOR</span>
              <span className="text-brand">{active.tag}</span>
              <span>DESTINATION</span>
            </div>
            <div className="relative mx-4 mb-4 h-[6px] rounded-full bg-line">
              <div className="absolute inset-y-0 left-0 rounded-full bg-brand transition-all duration-700 ease-out" style={{ width: `${(step / (total - 1)) * 100}%` }} />
              <span
                className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-navy bg-brand transition-all duration-700 ease-out"
                style={{ left: `calc(${(step / (total - 1)) * 100}% - ${(step / (total - 1)) * 16}px)` }}
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
