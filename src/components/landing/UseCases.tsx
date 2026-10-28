import { USE_CASES } from "./data";
import { Icon } from "./Icon";
import { Reveal } from "./motion";
import { GRID, GRID_CARD, Section, SectionHeading } from "./SectionHeading";

export default function UseCases() {
  return (
    <Section id="usecases" tone="canvas">
      <SectionHeading kicker="What's your trip?" title="One team." accent="Every journey." />
      <div className={GRID}>
        {USE_CASES.map((u, i) => (
          <Reveal key={u.solution} delay={(i % 4) * 60} className={`${GRID_CARD} group flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-card-lg`}>
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon name={u.icon} size={20} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[14px] text-steel">{u.problem}</span>
              <span className="font-display text-[16px] font-bold leading-tight text-ink">{u.solution}</span>
            </div>
            <a href="#book" className="mt-auto flex items-center gap-1.5 text-[14px] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
              Book this <Icon name="arrow" size={13} />
            </a>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
