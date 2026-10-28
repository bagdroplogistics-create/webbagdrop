import { Icon } from "./Icon";
import { Reveal } from "./motion";
import { CONTAINER } from "./SectionHeading";

export default function ClosingCta() {
  return (
    <section className={`${CONTAINER} bg-canvas py-16 sm:py-20`}>
      <Reveal className="overflow-hidden rounded-3xl bg-navy px-8 py-14 sm:px-14 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-14">
          <h2 className="font-display text-[clamp(2.4rem,5.4vw,4.1rem)] font-extrabold leading-[0.95] tracking-tight text-white text-balance">
            Ready to travel <span className="text-brand">light?</span>
          </h2>
          <div className="flex flex-col gap-5">
            <p className="max-w-md text-[17px] leading-relaxed text-white/70">
              Your next trip starts the moment you stop carrying your bags. Book in under 2 minutes.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#book" className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-white hover:text-navy">
                Book a Pickup <Icon name="arrow" size={16} />
              </a>
              <a href="#solutions" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-6 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-white hover:text-navy">
                Explore Services
              </a>
            </div>
            <span className="font-mono text-[12px] tracking-[0.14em] text-white/50">OPERATING IN MUMBAI · DELHI · AHMEDABAD · GOA</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
