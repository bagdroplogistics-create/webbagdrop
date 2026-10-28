import Image from "next/image";
import { Icon } from "./Icon";
import { Reveal } from "./motion";

const DEMO_STEPS = [
  { l: "Booked", done: true },
  { l: "Picked up", done: true },
  { l: "In transit", done: false, now: true },
  { l: "Delivered", done: false },
];

export default function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="flex flex-col gap-6">
          <Reveal className="flex items-center gap-2.5 font-mono text-[11px] font-semibold tracking-[0.25em] text-brand">
            <span className="h-[3px] w-10 bg-brand" /> DOOR-TO-DOOR, INDIA-WIDE
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-[clamp(2.4rem,5.2vw,3.75rem)] font-extrabold leading-[0.98] tracking-tight text-ink text-balance">
              Travel light.<br />
              <span className="text-brand">We carry the rest.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="max-w-lg text-[17px] leading-relaxed text-graphite">
              Door-to-door baggage across India — home, hotel, airport, station or cruise terminal. Sealed at pickup, tracked every step, released only to you. GST 5%, no hidden charges.
            </p>
          </Reveal>
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
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-faint">BD-4K7P2X · EXAMPLE</span>
              <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[9px] tracking-wider text-steel">ILLUSTRATIVE</span>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              {DEMO_STEPS.map((s) => (
                <div key={s.l} className="flex items-center gap-2.5">
                  <span className={`size-2 rounded-full ${s.done ? "bg-ink" : s.now ? "bg-brand" : "bg-line"}`} />
                  <span className={`text-[13px] font-medium ${s.done || s.now ? "text-ink" : "text-faint"}`}>{s.l}</span>
                  {s.now && <span className="ml-auto font-mono text-[10px] tracking-wider text-brand">LIVE</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line bg-paper/60 px-4 py-3">
              <span className="font-mono text-[10px] tracking-[0.14em] text-faint">EST. ARRIVAL</span>
              <span className="font-display text-lg font-extrabold text-ink">45 min</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
