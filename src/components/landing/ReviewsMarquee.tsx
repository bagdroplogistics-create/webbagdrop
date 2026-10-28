import { REVIEWS } from "./data";
import { Marquee, Reveal } from "./motion";
import { Section, SectionHeading } from "./SectionHeading";

function Stars({ size = 16 }: { size?: number }) {
  return (
    <span className="flex gap-0.5 text-brand">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
      ))}
    </span>
  );
}

export default function ReviewsMarquee() {
  return (
    <Section bleedClassName="bg-paper/50" className="!py-16 sm:!py-20">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <SectionHeading kicker="Google reviews" title="What our" accent="customers say." />
        <Reveal delay={120} className="flex items-center gap-5">
          <span className="font-display text-5xl font-extrabold tracking-tight text-ink">5.0</span>
          <div className="flex flex-col gap-1.5">
            <Stars />
            <span className="text-[13px] text-steel">13 reviews · verified on Google</span>
          </div>
          <a href="https://www.google.com/search?q=Bagdrop+Logistics+Solutions" target="_blank" rel="noopener" className="border-b border-ink pb-0.5 text-[13px] font-semibold text-ink">
            See all reviews
          </a>
        </Reveal>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <Marquee durationS={55}>
          <div className="flex">
            {REVIEWS.map((r, i) => (
              <div key={r.n + i} className="flex w-[320px] shrink-0 flex-col gap-3 border-r border-line p-6">
                <Stars size={13} />
                <p className="line-clamp-4 text-[14px] leading-relaxed text-ink">&ldquo;{r.q}&rdquo;</p>
                <div className="mt-auto flex items-center gap-2.5 pt-1">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-semibold text-white">{r.i}</span>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-ink">{r.n}</span>
                    <span className="font-mono text-[10px] tracking-wide text-faint">{r.w.toUpperCase()}</span>
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
