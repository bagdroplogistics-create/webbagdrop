import { CITIES } from "./data";
import { Marquee } from "./motion";

/** Its own full-bleed section — edge-to-edge, no side container/padding,
 * no rounded corners — matching the source mockup, where this ticker runs
 * the full browser width directly, not boxed inside the same padded
 * container as the stats above it. */
export default function CitiesStrip() {
  return (
    <section className="overflow-hidden bg-navy py-5 text-white sm:py-6">
      <Marquee durationS={28}>
        <div className="flex items-center">
          {CITIES.map((c) => (
            <span key={c} className="flex items-center gap-5 px-5 font-display text-xl font-extrabold tracking-tight whitespace-nowrap sm:text-2xl">
              {c.toUpperCase()} <span className="size-2 shrink-0 bg-brand" aria-hidden="true" />
            </span>
          ))}
        </div>
      </Marquee>
    </section>
  );
}
