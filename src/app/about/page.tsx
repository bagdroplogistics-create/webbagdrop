import type { Metadata } from "next";
import Image from "next/image";
import SiteHeader from "@/components/landing/SiteHeader";
import SiteFooter from "@/components/landing/SiteFooter";
import WhatsappFab from "@/components/landing/WhatsappFab";
import { Icon } from "@/components/landing/Icon";
import { Section, SectionHeading, GRID, GRID_CARD } from "@/components/landing/SectionHeading";
import { STATS, SOLUTIONS, PROCESS_STEPS } from "@/components/landing/data";
import { COMPANY } from "@/lib/company";
import { withBase } from "@/lib/basePath";

export const metadata: Metadata = {
  title: "About Bagdrop · Door-to-door baggage across India",
  description: "Bagdrop moves excess baggage, luggage and household goods door-to-door across India — sealed at pickup, tracked in transit, insured, with GST invoices on every booking.",
};

export default function About() {
  return (
    <main className="min-h-screen overflow-x-clip">
      <SiteHeader />

      <section className="relative isolate overflow-hidden text-center">
        <Image
          src="/images/landing/excess.jpg"
          alt="Traveller checking in excess baggage at an airport counter"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/80 to-ink/90" />
        <div className="relative mx-auto max-w-[1440px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 xl:px-14">
          <p className="font-mono text-[12px] font-semibold tracking-[0.22em] text-white/70">ABOUT BAGDROP</p>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-[clamp(2.3rem,5vw,3.75rem)] font-extrabold leading-[1.04] tracking-tight text-white">
            We carry the bags. <span className="text-brand">You carry on.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[17px] leading-relaxed text-white/75">
            Bagdrop is India&apos;s door-to-door baggage service — we pick up your bags from home,
            hotel or station and have them waiting at your destination, sealed at pickup and
            tracked at every stage, so you travel light and arrive empty-handed.
          </p>
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <p className={`font-display text-2xl font-extrabold ${"brand" in s && s.brand ? "text-brand" : "text-white"}`}>{s.value}</p>
                <p className="mt-1 text-[12px] text-white/70">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section tone="paper">
        <SectionHeading kicker="Our story" title="Built for travellers who" accent="hate carrying luggage" />
        <div className="grid gap-8 lg:grid-cols-2">
          <p className="text-[16px] leading-relaxed text-graphite">
            Bagdrop started with a simple problem every frequent traveller knows — excess
            baggage fees, trolleys through crowded terminals, and bags that slow down every
            journey. We built the infrastructure to fix it: a captain who collects your bags at
            your door, seals and photographs them with you, and a network that moves them to
            your next airport, hotel, station or home — while you travel with just a day bag.
          </p>
          <p className="text-[16px] leading-relaxed text-graphite">
            Today Bagdrop runs across 50+ cities for individual travellers, destination
            weddings, students relocating for study, and corporates moving teams — every
            booking sealed, scan-tracked end to end, insured, and billed with a proper GST
            invoice. {COMPANY.name.replace(" PRIVATE LIMITED", "")} is registered under GSTIN{" "}
            {COMPANY.gstin}, headquartered in Vadodara, Gujarat.
          </p>
        </div>
      </Section>

      <Section tone="canvas">
        <SectionHeading kicker="What we do" title="One service," accent="every kind of baggage move" />
        <div className={GRID}>
          {SOLUTIONS.map((s) => (
            <div key={s.title} className={`${GRID_CARD} rounded-2xl border border-line bg-white p-5`}>
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon name={s.icon} size={22} />
              </div>
              <p className="mt-3 font-display text-[15px] font-bold text-ink">{s.title}</p>
              {s.tag && <p className="mt-1 font-mono text-[11px] font-semibold tracking-wide text-brand">{s.tag}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper">
        <SectionHeading kicker="How it works" title="Four steps," accent="start to finish" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS_STEPS.map((p) => (
            <div key={p.n} className="rounded-2xl border border-line bg-white p-5">
              <p className="font-mono text-[12px] font-semibold text-brand">{p.n}</p>
              <p className="mt-2 font-display text-lg font-bold text-ink">{p.t}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{p.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="text-center" tone="canvas">
        <SectionHeading kicker="Why travellers trust us" title="Sealed, tracked" accent="and insured — always" />
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: "lock", label: "Sealed at pickup" },
            { icon: "shield", label: "Insured" },
            { icon: "bell", label: "WhatsApp + email updates" },
            { icon: "briefcase", label: "GST invoice on every booking" },
          ].map((t) => (
            <div key={t.label} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-4">
              <Icon name={t.icon} size={22} className="text-brand" />
              <p className="text-[12px] text-muted">{t.label}</p>
            </div>
          ))}
        </div>
        <a
          href={withBase("/new-booking")}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
        >
          Book your pickup <Icon name="arrow" size={15} />
        </a>
      </Section>

      <SiteFooter />
      <WhatsappFab />
    </main>
  );
}
