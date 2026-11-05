import Link from "next/link";
import { TUTORIAL } from "../tutorialSteps";
import PrintButton from "../guide/PrintButton";

export const metadata = { title: "Tutorial · from inquiry to reconciled payment · BAGDROP OS" };

/** The team tutorial: one real booking, start to finish, with the clicks
 *  and the screen at each step. Printable; behind the admin sign-in. */
export default function TutorialPage() {
  return (
    <main className="mx-auto max-w-5xl bg-white px-6 py-8 text-ink print:px-0">
      <div className="mb-6 flex items-end justify-between gap-3 print:mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">BAGDROP OS · team tutorial</p>
          <h1 className="font-display text-2xl font-extrabold">From the inquiry to the reconciled payment</h1>
          <p className="text-sm text-muted">Thirteen steps, followed on one real booking. Every step says what you see, what to click, and what the client receives. Phase 1: the team records every move in Operations; no driver app.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href="/admin/tutorial/wedding" className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Weddings &amp; events tutorial</Link>
          <Link href="/admin/guide" className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Guide</Link>
          <PrintButton />
        </div>
      </div>
      <ol className="grid gap-6">
        {TUTORIAL.map((s) => (
          <li key={s.n} className="grid gap-3 rounded-2xl border border-line p-5 print:break-inside-avoid print:border-0 print:p-0" id={`step-${s.n}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white">Step {s.n}</span>
              <h2 className="font-display text-lg font-bold">{s.title}</h2>
              <span className="text-xs text-muted">{s.where}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-2 text-[13px]">
                <p><b>You see:</b> {s.see}</p>
                <div><b>Do this:</b>
                  <ol className="mt-1 grid list-decimal gap-1 pl-5">{s.do.map((d, i) => <li key={i}>{d}</li>)}</ol>
                </div>
                <p><b>The client gets:</b> <span className="text-muted">{s.client}</span></p>
                {s.auto && <p><b>On its own:</b> <span className="text-muted">{s.auto}</span></p>}
                <p className="rounded-lg bg-paper px-3 py-2 text-xs text-muted"><b className="text-ink">Narration:</b> {s.say}</p>
              </div>
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/tutorial/${s.image}`} alt={`${s.title} on screen`} className="w-full rounded-xl border border-line" loading="lazy" />
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs text-muted">Screens recorded on the local build with demo data. Open the matching module from the sidebar to try each step yourself.</p>
    </main>
  );
}
