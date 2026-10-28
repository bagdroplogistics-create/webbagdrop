import { Reveal } from "./motion";

export type ProcessStep = { n: string; t: string; d: string };

/** A clean numbered process timeline — a thin connecting line sits BEHIND
 *  circular step markers (never crossing text or passing through cards),
 *  horizontal on desktop and a left-rail vertical line on mobile. */
export function ProcessTimeline({ steps, markerBg = "bg-canvas" }: { steps: ProcessStep[]; markerBg?: string }) {
  return (
    <div className="relative">
      <div
        className="absolute top-5 left-5 w-px bg-line sm:top-5 sm:left-0 sm:h-px sm:w-full"
        style={{ bottom: "0" }}
        aria-hidden="true"
      />
      <ol className="relative grid grid-cols-1 gap-8 sm:grid-cols-4 sm:gap-6">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 110} as="li" className="relative flex gap-4 sm:flex-col sm:gap-4">
            <span className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-brand ${markerBg} font-mono text-[13px] font-bold text-brand`}>
              {s.n}
            </span>
            <div className="flex flex-col gap-1 pt-1 sm:pt-0">
              <span className="font-display text-lg font-bold text-ink">{s.t}</span>
              <span className="text-[14px] leading-snug text-graphite">{s.d}</span>
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
