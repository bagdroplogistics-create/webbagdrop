import Image from "next/image";
import { CLIENTS, REVIEWS } from "./data";
import { Marquee, Reveal } from "./motion";
import { Section, SectionHeading } from "./SectionHeading";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Stars({ size = 16 }: { size?: number }) {
  return (
    <span className="flex gap-0.5 text-brand">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
      ))}
    </span>
  );
}

/** Happy clients + Google reviews, merged into one section — both are the
 *  same story (real customers, real deliveries, real reviews), so they
 *  share one heading instead of repeating it twice on the page. */
export default function Testimonials() {
  return (
    <Section tone="canvas">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <SectionHeading kicker="Happy clients" title="Real customers." accent="Real deliveries." />
        <Reveal delay={120} className="flex items-center gap-5">
          <span className="font-display text-6xl font-extrabold tracking-tight text-ink">5.0</span>
          <div className="flex flex-col gap-1.5">
            <Stars />
            <span className="text-[14px] text-steel">13 reviews · verified on Google</span>
          </div>
          <a href="https://www.google.com/search?q=Bagdrop+Logistics+Solutions" target="_blank" rel="noopener" className="border-b border-ink pb-0.5 text-[14px] font-semibold text-ink">
            See all reviews
          </a>
        </Reveal>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CLIENTS.map((c, i) => (
          <Reveal key={c.name} delay={i * 70} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
            <div className="relative aspect-[4/5] bg-paper">
              {c.img ? (
                <Image src={c.img} alt={c.name} fill sizes="20vw" className="object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center font-display text-4xl font-extrabold text-faint">{initials(c.name)}</div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 border-t border-line p-3.5">
              <span className="truncate font-display text-[15px] font-bold text-ink">{c.name}</span>
              <span className="font-mono text-[11px] tracking-wider text-steel">{c.bags.toUpperCase()}</span>
              <span className="truncate text-[13px] text-steel">{c.route}</span>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mb-5 mt-14 flex items-center gap-2.5 font-mono text-[12px] font-semibold tracking-[0.22em] text-steel">
        <span className="h-[3px] w-10 bg-brand" /> GOOGLE REVIEWS
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <Marquee durationS={55}>
          <div className="flex">
            {REVIEWS.map((r, i) => (
              <div key={r.n + i} className="flex w-[320px] shrink-0 flex-col gap-3 border-r border-line p-6">
                <Stars size={13} />
                <p className="line-clamp-4 text-[15px] leading-relaxed text-ink">&ldquo;{r.q}&rdquo;</p>
                <div className="mt-auto flex items-center gap-2.5 pt-1">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[12px] font-semibold text-white">{r.i}</span>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold text-ink">{r.n}</span>
                    <span className="font-mono text-[11px] tracking-wide text-faint">{r.w.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Marquee>
      </div>
    </Section>
  );
}
