import Guide from "../Guide";
import PrintButton from "./PrintButton";

export const metadata = { title: "How a booking moves · BAGDROP OS" };

/** Printable, all three kinds on one page. Behind the admin sign-in (src/proxy.ts). */
export default function GuidePage() {
  return (
    <main className="mx-auto max-w-4xl bg-white px-6 py-8 text-ink print:px-0">
      <div className="mb-6 flex items-end justify-between gap-3 print:mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">BAGDROP OS · team guide</p>
          <h1 className="font-display text-2xl font-extrabold">How a booking moves, start to finish</h1>
          <p className="text-sm text-muted">Five phases, the same for every kind of booking: Received → Confirmed → Paid / billed → Moving → Completed.</p>
        </div>
        <PrintButton />
      </div>
      <Guide print />
    </main>
  );
}
