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
          <Reveal key={p.pain} delay={i * 80} className={`${GRID_CARD} flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-card`}>
            <span className="font-display text-4xl font-extrabold tracking-tight text-ink">{p.big}</span>
            <span className="text-[15px] leading-snug text-graphite">{p.pain}</span>
            <span className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[15px] font-semibold text-brand">
              <Icon name="check" size={15} /> {p.fix}
            </span>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
