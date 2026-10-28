import type { ReactNode } from "react";
import { Reveal } from "./motion";

export function SectionHeading({
  kicker, title, accent, id,
}: { kicker: string; title: string; accent: string; id?: string }) {
  return (
    <Reveal className="mb-10 flex flex-col gap-3 sm:mb-14" as="div">
      <span id={id} className="flex scroll-mt-24 items-center gap-2.5 font-mono text-[11px] font-semibold tracking-[0.22em] text-brand">
        <span className="h-[3px] w-10 bg-brand" /> {kicker.toUpperCase()}
      </span>
      <h2 className="font-display text-[clamp(1.9rem,3.8vw,2.9rem)] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
        {title} <span className="text-brand">{accent}</span>
      </h2>
    </Reveal>
  );
}

/** Industry-standard responsive container: 1140–1200px max width (we use
 *  1152px / max-w-6xl), with side margins scaled to the breakpoint —
 *  16px mobile, 32–40px tablet (36px), 80–120px desktop (64px→96px) — per
 *  the standard 12/8/4-column grid breakdown (see GridSection for the
 *  column/gutter half of that same system). */
export const CONTAINER = "mx-auto max-w-6xl px-4 md:px-9 lg:px-16 xl:px-24";

const TONES = { canvas: "bg-canvas", paper: "bg-paper/60", white: "bg-white" } as const;

export function Section({
  id, className, bleedClassName, tone, children,
}: { id?: string; className?: string; bleedClassName?: string; tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 ${tone ? TONES[tone] : ""} ${bleedClassName ?? ""}`}>
      <div className={`${CONTAINER} py-16 sm:py-20 ${className ?? ""}`}>
        {children}
      </div>
    </section>
  );
}

/** The 12/8/4-column grid itself (16px mobile gutters, 20px tablet,
 *  24px desktop — "commonly 24px" per the standard breakdown). Children
 *  use col-span-2 md:col-span-2 lg:col-span-3 for a 2-up/4-up/4-up card
 *  rhythm, the shape every count-of-4/8/12 section on this page uses. */
export const GRID = "grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-5 lg:grid-cols-12 lg:gap-6";
export const GRID_CARD = "col-span-2 md:col-span-2 lg:col-span-3";
