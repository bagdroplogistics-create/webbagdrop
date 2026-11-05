import Link from "next/link";
import { WEDDING_TUTORIAL, WHO } from "../../weddingTutorialSteps";
import PrintButton from "../../guide/PrintButton";

export const metadata = { title: "Tutorial · weddings & events · BAGDROP OS" };

const TONE: Record<keyof typeof WHO, string> = { guest: "#1F5FA8", team: "#0A1628", planner: "#1E7F4F" };

/** Weddings & events: the guest's desk, BAGDROP OS and the planner's desk,
 *  one record between them. Printable; behind the admin sign-in. */
export default function WeddingTutorialPage() {
  return (
    <main className="mx-auto max-w-5xl bg-white px-6 py-8 text-ink print:px-0">
      <div className="mb-6 flex items-end justify-between gap-3 print:mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">BAGDROP OS · team tutorial · weddings &amp; events</p>
          <h1 className="font-display text-2xl font-extrabold">Three screens, one record</h1>
          <p className="text-sm text-muted">The guest books on the Y2K desk and follows My bags. The Bagdrop team runs the event in BAGDROP OS. The event company works its own desk at /event. Whatever any of them records, the other two see.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href="/admin/tutorial" className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Main tutorial</Link>
          <Link href="/admin/guide" className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Guide</Link>
          <PrintButton />
        </div>
      </div>

      <section className="mb-6 grid gap-3 rounded-2xl border border-line p-5 sm:grid-cols-3 print:break-inside-avoid">
        {(Object.keys(WHO) as (keyof typeof WHO)[]).map((k) => (
          <div key={k} className="grid gap-1 text-[13px]">
            <span className="w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: TONE[k] }}>{WHO[k]}</span>
            {k === "guest" && <p className="text-muted">Books the family at <b>/e/y2k</b>; signs in to <b>/e/y2k/my</b> with a WhatsApp code to see tags, stages, rooms and messages. Cannot edit a saved booking.</p>}
            {k === "team" && <p className="text-muted">Sets the event up, its commercials and the planners; confirms families; moves the bags in Operations; sees every thread. Shares the links: landing page, wedding desk, /event, on-site manifest.</p>}
            {k === "planner" && <p className="text-muted">Signs in at <b>/event</b> with a WhatsApp code to a mobile the team listed. Answers guests, sets rooms, prints tags, accepts return bags, for its own event only. Cannot approve, price or cancel.</p>}
          </div>
        ))}
        <p className="text-[12px] text-muted sm:col-span-3">How they connect: one booking per family holds the guests, bags, rooms, messages and bag stages. The guest writes it on the desk; the team and the planner change rooms, replies and stages; the guest&apos;s page and the planner&apos;s desk refresh themselves. Replies also go out on WhatsApp.</p>
      </section>

      <ol className="grid gap-6">
        {WEDDING_TUTORIAL.map((s) => (
          <li key={s.n} className="grid gap-3 rounded-2xl border border-line p-5 print:break-inside-avoid print:border-0 print:p-0" id={`step-${s.n}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: TONE[s.who] }}>Step {s.n} · {WHO[s.who].split(" · ")[0]}</span>
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
      <p className="mt-8 text-xs text-muted">Screens recorded on the local build with the Y2K demo event. Open the matching screen to try each step yourself.</p>
    </main>
  );
}
