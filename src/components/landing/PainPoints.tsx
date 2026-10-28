import { PAINS } from "./data";
import { Icon } from "./Icon";
import { Reveal } from "./motion";
import { Section, SectionHeading } from "./SectionHeading";

export default function PainPoints() {
  return (
    <Section id="why" bleedClassName="bg-paper/50">
      <SectionHeading kicker="Why it's needed" title="Heavy bags slow" accent="every journey down." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PAINS.map((p, i) => (
          <Reveal key={p.pain} delay={i * 80} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-card">
            <span className="font-display text-3xl font-extrabold tracking-tight text-ink">{p.big}</span>
            <span className="text-[14px] leading-snug text-graphite">{p.pain}</span>
            <span className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[14px] font-semibold text-brand">
              <Icon name="check" size={15} /> {p.fix}
            </span>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
