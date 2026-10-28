import Image from "next/image";
import { CLIENTS } from "./data";
import { Reveal } from "./motion";
import { Section, SectionHeading } from "./SectionHeading";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function Testimonials() {
  return (
    <Section>
      <SectionHeading kicker="Happy clients" title="Real customers." accent="Real deliveries." />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CLIENTS.map((c, i) => (
          <Reveal key={c.name} delay={i * 70} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
            <div className="relative aspect-[4/5] bg-paper">
              {c.img ? (
                <Image src={c.img} alt={c.name} fill sizes="20vw" className="object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center font-display text-3xl font-extrabold text-faint">{initials(c.name)}</div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 border-t border-line p-3.5">
              <span className="truncate font-display text-[14px] font-bold text-ink">{c.name}</span>
              <span className="font-mono text-[10px] tracking-wider text-brand">{c.bags.toUpperCase()}</span>
              <span className="truncate text-[12px] text-steel">{c.route}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
