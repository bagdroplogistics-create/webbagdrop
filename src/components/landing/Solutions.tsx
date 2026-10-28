import Image from "next/image";
import { SOLUTIONS } from "./data";
import { Icon } from "./Icon";
import { Reveal } from "./motion";
import { GRID, GRID_CARD, Section, SectionHeading } from "./SectionHeading";

export default function Solutions() {
  return (
    <Section id="solutions" tone="canvas">
      <SectionHeading kicker="Solutions" title="Twelve ways" accent="to travel light." />
      <div className={GRID}>
        {SOLUTIONS.map((s, i) => (
          <Reveal key={s.title} delay={(i % 4) * 60} className={GRID_CARD}>
            <a href="#book" className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-all hover:-translate-y-0.5 hover:shadow-card-lg">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image src={s.image} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                {s.tag && (
                  <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-white">
                    {s.tag.toUpperCase()}
                  </span>
                )}
                <span className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-xl bg-white/90 text-navy shadow-card backdrop-blur">
                  <Icon name={s.icon} size={18} />
                </span>
              </div>
              <span className="flex items-center justify-between gap-2 p-4 font-display text-[16px] font-bold leading-tight text-ink">
                {s.title}
                <Icon name="arrow" size={15} className="shrink-0 text-faint transition-colors group-hover:text-brand" />
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
