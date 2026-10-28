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

export function Section({
  id, className, bleedClassName, children,
}: { id?: string; className?: string; bleedClassName?: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 ${bleedClassName ?? ""}`}>
      <div className={`mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 ${className ?? ""}`}>
        {children}
      </div>
    </section>
  );
}
