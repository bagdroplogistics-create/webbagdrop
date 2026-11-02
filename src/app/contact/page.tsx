import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section } from "@/components/legal/LegalPage";
import { CONTACT } from "@/lib/company";

export const metadata: Metadata = { title: "Contact · Bagdrop", description: "Reach Bagdrop on WhatsApp, phone or email; our Mumbai and Vadodara offices." };
const tel = (s: string) => `tel:${s.replace(/[^\d+]/g, "")}`;

export default function Contact() {
  const link = "font-semibold text-ink underline decoration-brand underline-offset-4";
  return (
    <LegalPage kicker="Contact" title="Talk to Bagdrop" intro="Questions about a booking, a quote for a group or wedding, or a partnership — we reply fastest on WhatsApp." dated={false}>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { h: "WhatsApp", lines: CONTACT.whatsapp.map((w) => <a key={w} className={link} href={`https://wa.me/${w.replace(/\D/g, "")}`} target="_blank" rel="noopener">{w}</a>) },
          { h: "Phone", lines: [<a key="p" className={link} href={tel(CONTACT.phone)}>{CONTACT.phone}</a>] },
          { h: "Email", lines: [<a key="e" className={link} href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>] },
        ].map((c) => (
          <div key={c.h} className="rounded-2xl border border-line bg-white p-5">
            <p className="font-mono text-[12px] font-semibold tracking-[0.16em] text-brand">{c.h.toUpperCase()}</p>
            <div className="mt-2 grid gap-1 text-[16px]">{c.lines}</div>
          </div>
        ))}
      </div>
      <Section title="Offices">
        <p><b className="text-ink">Mumbai</b><br />{CONTACT.mumbai}</p>
        <p><b className="text-ink">Registered office, Vadodara</b><br />{CONTACT.registered}</p>
        <p className="text-sm text-muted">{CONTACT.legalName} · GSTIN {CONTACT.gstin}</p>
      </Section>
      <Section title="Already booked?">
        <p>Sign in to <Link className={link} href="/account">My bookings</Link> with the mobile or email you booked with to see your bags, tags and tracking link. Travel agents, hotels and event companies use the <Link className={link} href="/partner">partner login</Link>.</p>
      </Section>
      <Section title="Complaints and privacy requests">
        <p>Email <a className={link} href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> with your booking number. Privacy requests are handled as described in our <Link className={link} href="/privacy">Privacy Policy</Link>.</p>
      </Section>
    </LegalPage>
  );
}
