import Wizard from "@/components/booking/Wizard";

export default function Home() {
  return (
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-display text-lg font-extrabold tracking-tight">
            BAG<span className="text-brand">DROP</span>
          </span>
          <span className="text-xs text-muted">Bag. Box. Delivered. · www.bagdrop.co</span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-8 pt-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">Sealed · Tracked · Insured</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Travel light. <span className="text-muted">We carry the rest.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
          Door-to-door baggage across India — sealed with you at pickup, tracked every step, released only to you. GST 5%, no hidden charges.
        </p>
      </section>

      <section className="px-4">
        <Wizard />
      </section>
    </main>
  );
}
