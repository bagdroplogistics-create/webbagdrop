import type { ReactNode } from "react";
import { Reveal } from "./motion";

export function SectionHeading({
  kicker, title, accent, id,
}: { kicker: string; title: string; accent: string; id?: string }) {
  return (
    <Reveal className="mb-10 flex flex-col gap-3 sm:mb-14" as="div">
      <span id={id} className="flex scroll-mt-24 items-center gap-2.5 font-mono text-[12px] font-semibold tracking-[0.22em] text-brand">
        <span className="h-[3px] w-10 bg-brand" /> {kicker.toUpperCase()}
      </span>
      <h2 className="font-display text-[clamp(2.1rem,4.2vw,3.2rem)] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
        {title} <span className="text-brand">{accent}</span>
      </h2>
    </Reveal>
  );
}

/** Wide content container — 1440px max width, with modest side margins
 *  scaled to the breakpoint (16px mobile, 24px tablet, 40px → 56px
 *  desktop) so the page reads as a broad, confident layout rather than a
 *  narrow centered column, while still leaving a little breathing room
 *  at the very edge. */
export const CONTAINER = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 xl:px-14";

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
