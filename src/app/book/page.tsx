import Link from "next/link";
import Wizard from "@/components/booking/Wizard";

export default function Home() {
  return (
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-display text-lg font-extrabold tracking-tight">
            BAG<span className="text-brand">DROP</span>
          </span>
          <span className="flex items-center gap-4 text-xs text-muted">
            <Link href="/account" className="font-semibold text-ink hover:text-brand">My bookings</Link>
            <Link href="/partner" className="font-semibold text-ink hover:text-brand">Partner login</Link>
            <span className="hidden sm:inline">Bag. Box. Delivered. · www.bagdrop.co</span>
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-8 pt-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">Sealed · Tracked · Insured</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Travel light. <span className="text-muted">We carry the rest.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
          Door-to-door baggage across India — sealed with you at pickup, tracked every step, released only to you. Book in two minutes; our team confirms your plan personally.
        </p>
      </section>

      {/* how booking works — one slim, animated strip; details live in the wizard */}
      <section className="mx-auto max-w-5xl px-4 pb-8">
        <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {([
            ["1", "Book in 2 minutes", "Route, bags and pickup window — no payment now"],
            ["2", "We confirm your plan", "A specialist calls with your rate, usually within the hour"],
            ["3", "Pay by secure link", "Only after you approve — Aadhaar check follows"],
            ["4", "Sealed pickup, live tracking", "Tagged with you at the door, scanned to delivery"],
          ] as const).map(([n, t, s], i) => (
            <li key={n} className="anim-in rounded-2xl border border-line bg-white p-3.5 shadow-card" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="mb-1.5 flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
              <b className="block font-display text-[13px] leading-tight">{t}</b>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-4">
        <Wizard />
      </section>

      {/* compact FAQ — four questions, no amounts anywhere */}
      <section className="mx-auto max-w-2xl px-4 pt-14">
        <h2 className="mb-3 text-center font-display text-xl font-extrabold tracking-tight">Common questions</h2>
        <div className="grid gap-2">
          {([
            ["How is my bag kept safe?", "Our captain checks and seals each bag with you at the door, fixes a scan-tag to every piece, and each hand-off is scanned. Bags are insured in transit and released only against your verified identity."],
            ["When and how do I pay?", "Never on this page. After you submit, a Bagdrop specialist confirms your rate and pickup plan personally, then sends a secure payment link. You pay only once you approve."],
            ["What should I not pack?", "Cash, jewellery, passports, medicines you need during travel, and loose lithium batteries. Everything else travels sealed — the captain checks with you at pickup."],
            ["How do I track my bags?", "Your booking page shows live status, and you get WhatsApp and email updates at every milestone — pickup, hub, departure, arrival and delivery."],
          ] as const).map(([q, a], i) => (
            <details key={q} className="anim-in group rounded-2xl border border-line bg-white px-4 py-3 shadow-card" style={{ animationDelay: `${i * 70}ms` }}>
              <summary className="cursor-pointer list-none font-display text-[14px] font-bold marker:hidden">
                <span className="flex items-center justify-between gap-3">{q}<span className="text-brand transition-transform group-open:rotate-45">+</span></span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* floating WhatsApp help — one tap to a human */}
      <a
        href="https://wa.me/916357115711?text=Hi%20Bagdrop%2C%20I%20have%20a%20question%20about%20booking%20a%20pickup."
        target="_blank" rel="noreferrer" aria-label="WhatsApp Bagdrop support"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] py-2.5 pl-3 pr-4 font-display text-[13px] font-bold text-white shadow-card-lg transition-transform hover:scale-105"
      >
        <svg viewBox="0 0 32 32" className="size-5 fill-white" aria-hidden><path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.8 5 2.3 7L4.2 28l6.3-2c2 1.1 4.2 1.6 6.5 1.6 6.6 0 12-5.3 12-11.9S22.6 3 16 3zm6 16.5c-.3.8-1.6 1.5-2.2 1.6-.6.1-1.3.2-3.7-.8-3.1-1.3-5.1-4.4-5.3-4.6-.2-.2-1.3-1.7-1.3-3.2s.8-2.3 1.1-2.6c.3-.3.6-.4.8-.4h.6c.2 0 .5-.1.7.5l1 2.5c.1.2.1.4 0 .6l-.4.7-.6.6c-.2.2-.4.4-.2.8.2.3 1 1.6 2.1 2.6 1.5 1.3 2.7 1.7 3 1.9.4.2.6.2.8-.1l1.2-1.4c.3-.3.5-.3.8-.2l2.6 1.2c.4.2.6.3.7.4.1.3.1 1-.2 1.9z"/></svg>
        WhatsApp us
      </a>
    </main>
  );
}
