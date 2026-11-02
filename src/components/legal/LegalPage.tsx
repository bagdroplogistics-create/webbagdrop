import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import SiteFooter from "@/components/landing/SiteFooter";
import { CONTAINER } from "@/components/landing/SectionHeading";
import { CONTACT } from "@/lib/company";

/** Shared layout for Terms, Privacy, Refund, Contact and About: a light
 *  header (logo home, My bookings, Book now), the page title, an effective
 *  date for policies, the content, and the site footer. */
export default function LegalPage({ kicker, title, intro, dated = true, children }: { kicker: string; title: string; intro?: string; dated?: boolean; children: ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-clip bg-paper">
      <header className="border-b border-line bg-white">
        <div className={`flex h-16 items-center justify-between gap-3 ${CONTAINER}`}>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/images/logo-icon.png" alt="" width={25} height={32} className="h-8 w-auto" />
            <span className="font-display text-lg font-extrabold tracking-tight text-ink">BAG<span className="text-brand">DROP</span></span>
          </Link>
          <nav className="flex items-center gap-4 text-[15px]">
            <Link href="/account" className="hidden font-semibold text-ink hover:text-brand sm:inline">My bookings</Link>
            <Link href="/#book" className="rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:opacity-90">Book now</Link>
          </nav>
        </div>
      </header>
      <article className={`py-10 sm:py-14 ${CONTAINER}`}>
        <div className="mx-auto max-w-3xl">
          <p className="font-mono text-[12px] font-semibold tracking-[0.18em] text-brand">{kicker.toUpperCase()}</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
          {intro && <p className="mt-3 text-[17px] leading-relaxed text-graphite">{intro}</p>}
          {dated && <p className="mt-3 text-sm text-muted">Effective {CONTACT.policyDate} · {CONTACT.legalName}</p>}
          <div className="legal mt-8 space-y-8 text-[16px] leading-relaxed text-graphite">{children}</div>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}

/** A numbered policy section. */
export function Section({ n, title, children }: { n?: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-7">
      <h2 className="mb-3 font-display text-xl font-bold text-ink">{n ? `${n}. ` : ""}{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** A plain bullet list (dot markers, no icons). */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

/** The official contact block, used at the end of every policy. */
export function ContactBlock() {
  return (
    <div className="space-y-1 text-[15px]">
      <p className="font-semibold text-ink">{CONTACT.legalName}</p>
      <p>Registered office: {CONTACT.registered}</p>
      <p>Mumbai office: {CONTACT.mumbai}</p>
      <p>Phone {CONTACT.phone} · WhatsApp {CONTACT.whatsapp.join(" / ")} · <a className="font-semibold text-ink underline decoration-brand underline-offset-4" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>
      <p>GSTIN {CONTACT.gstin}</p>
    </div>
  );
}
