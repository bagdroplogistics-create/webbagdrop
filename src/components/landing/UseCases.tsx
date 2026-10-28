import Image from "next/image";
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
          <Reveal key={u.solution} delay={(i % 4) * 60} className={GRID_CARD}>
            <a href="#book" className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-all hover:-translate-y-0.5 hover:shadow-card-lg">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image src={u.image} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                <span className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-xl bg-white/90 text-brand shadow-card backdrop-blur">
                  <Icon name={u.icon} size={18} />
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <span className="text-[14px] text-steel">{u.problem}</span>
                <span className="font-display text-[16px] font-bold leading-tight text-ink">{u.solution}</span>
                <span className="mt-auto flex items-center gap-1.5 pt-1 text-[14px] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
                  Book this <Icon name="arrow" size={13} />
                </span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
