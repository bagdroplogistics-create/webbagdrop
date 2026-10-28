import Image from "next/image";
import { PAINS } from "./data";
import { Icon } from "./Icon";
import { Reveal } from "./motion";
import { GRID, GRID_CARD, Section, SectionHeading } from "./SectionHeading";

export default function PainPoints() {
  return (
    <Section id="why" tone="paper">
      <SectionHeading kicker="Why it's needed" title="Heavy bags slow" accent="every journey down." />
      <div className={GRID}>
        {PAINS.map((p, i) => (
          <Reveal key={p.pain} delay={i * 80} className={`${GRID_CARD} flex flex-col overflow-hidden rounded-2xl bg-white shadow-card`}>
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image src={p.image} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover" />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5">
              <span className="font-display text-4xl font-extrabold tracking-tight text-ink">{p.big}</span>
              <span className="text-[15px] leading-snug text-graphite">{p.pain}</span>
              <span className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[15px] font-semibold text-ink">
                <Icon name="check" size={15} className="shrink-0 text-brand" /> {p.fix}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
