import Image from "next/image";
import { FOOTER_COLS } from "./data";
import { CONTAINER } from "./SectionHeading";

const SOCIALS = [
  { href: "https://www.instagram.com/bagdropofficial", label: "Instagram", path: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm10 2H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm-5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" },
  { href: "https://www.facebook.com/profile.php?id=61579334791456", label: "Facebook", path: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" },
  { href: "https://www.linkedin.com/in/adizworld/", label: "LinkedIn", path: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" },
];

export default function SiteFooter() {
  return (
    <footer className="bg-navy text-white/70">
      <div className={`py-16 ${CONTAINER}`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-b border-white/10 pb-12 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-4 lg:col-span-2">
            {/* Source is 400×100 (4:1 ratio) — width/height set to match exactly so
             * the browser's aspect-ratio box doesn't stretch it when sized via CSS. */}
            <Image src="/images/logo-horizontal.png" alt="Bagdrop" width={200} height={50} className="h-12 w-auto" />
            <p className="max-w-[260px] text-[15px] text-white/60">The baggage infrastructure layer for modern travel.</p>
            <div className="flex gap-2.5">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener" aria-label={s.label} className="flex size-9 items-center justify-center rounded-lg border border-white/15 text-white transition-colors hover:border-brand hover:bg-brand">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={s.path} /></svg>
                </a>
              ))}
            </div>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.h} className="flex flex-col gap-2.5">
              <span className="font-mono text-[12px] font-semibold tracking-[0.16em] text-brand">{col.h.toUpperCase()}</span>
              {col.items.map((it) => (
                <a key={it} href="#top" className="text-[15px] text-white/60 transition-colors hover:text-white">{it}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-[13px] text-white/50">
          <span>© 2026 Bagdrop Logistics Solutions Pvt. Ltd. All rights reserved.</span>
          <span className="font-mono tracking-wide">Mumbai · Delhi · Goa · Gujarat · Rajasthan · Hyderabad · Bangalore</span>
        </div>
      </div>
    </footer>
  );
}
