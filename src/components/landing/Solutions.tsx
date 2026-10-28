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
            <a href="#book" className="group relative flex h-full flex-col justify-end overflow-hidden rounded-2xl border border-line bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-card-lg">
              {s.image ? (
                <>
                  <Image src={s.image} alt="" fill sizes="25vw" className="absolute inset-0 object-cover opacity-20 transition-opacity group-hover:opacity-30" />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/70 to-white/10" />
                </>
              ) : null}
              <div className="relative flex flex-col gap-3">
                {s.tag && (
                  <span className="w-fit rounded-full bg-brand px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-white">
                    {s.tag.toUpperCase()}
                  </span>
                )}
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="flex items-center justify-between gap-2 font-display text-[16px] font-bold leading-tight text-ink">
                  {s.title}
                  <Icon name="arrow" size={15} className="shrink-0 text-faint transition-colors group-hover:text-brand" />
                </span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
