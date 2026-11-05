import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { List, Section } from "@/components/legal/LegalPage";
import { CONTACT } from "@/lib/company";

export const metadata: Metadata = { title: "About · Bagdrop", description: "India's door-to-door baggage network: your bags travel separately, sealed, tracked at every handover and insured." };

export default function About() {
  return (
    <LegalPage kicker="About Bagdrop" title="India's door-to-door baggage network" intro="Bagdrop separates your bags from your journey. We pick them up from your door, carry them across the country and hand them over where you need them — so you travel light." dated={false}>
      <div className="grid grid-cols-3 gap-3">
        {[["12,000+", "moves"], ["98.7%", "on time"], ["5.0", "Google rating"]].map(([v, l], i) => (
          <div key={l} className="rounded-2xl border border-line bg-white p-4 text-center">
            <p className={`font-display text-2xl font-extrabold sm:text-3xl ${i === 2 ? "text-brand" : "text-ink"}`}>{v}</p>
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted">{l.toUpperCase()}</p>
          </div>
        ))}
      </div>
      <Section title="How it works">
        <List items={[
          <>Every bag is sealed, photographed and tagged at your door, and recorded at every handover until it reaches you.</>,
          <>Each shipment is insured up to ₹{CONTACT.insuranceCap.toLocaleString("en-IN")}.</>,
          <>Home to airport, airport to home, hotel to hotel, city to city, and destination weddings — for travellers, families, students and companies.</>,
          <>Travel agents, hotels and event companies book through their own partner desk; businesses connect through our API.</>,
        ]} />
      </Section>
      <Section title="Who we are">
        <p>{CONTACT.legalName}, with offices in Mumbai and Vadodara. Backed by our parent company, a logistics house in operation since 1950.</p>
        <p><Link href="/#book" className="font-semibold text-ink underline decoration-brand underline-offset-4">Book a pickup</Link> or <Link href="/contact" className="font-semibold text-ink underline decoration-brand underline-offset-4">talk to us</Link>.</p>
      </Section>
    </LegalPage>
  );
}
