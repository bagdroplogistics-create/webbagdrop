import Image from "next/image";
import Link from "next/link";
import { FOOTER_COLS } from "./data";
import { CONTAINER } from "./SectionHeading";

/** Same icon-mark + live-text composition as the header's logo, rather
 * than the flat logo-horizontal.png (a whole wordmark+tagline baked
 * into one raster image, which reads soft/blurry at small sizes and
 * doesn't line up cleanly with the surrounding text). */
function FooterLogo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <Image src="/images/logo-icon.png" alt="" width={31} height={40} className="h-10 w-auto" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-extrabold tracking-tight text-white">
          BAG<span className="text-brand">DROP</span>
        </span>
        <span className="mt-1 font-mono text-[10px] tracking-[0.2em] text-white/40">BAG. BOX. DELIVERED.</span>
      </span>
    </Link>
  );
}

const SOCIALS = [
  { href: "https://www.instagram.com/bagdropofficial", label: "Instagram" },
  { href: "https://www.facebook.com/profile.php?id=61579334791456", label: "Facebook" },
  { href: "https://www.linkedin.com/in/adizworld/", label: "LinkedIn" },
];

export default function SiteFooter() {
  return (
    <footer className="bg-navy text-white/70">
      <div className={`py-16 ${CONTAINER}`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-b border-white/10 pb-12 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-4 lg:col-span-2">
            <FooterLogo />
            <p className="max-w-[260px] text-[15px] text-white/60">The baggage infrastructure layer for modern travel.</p>
            <p className="max-w-[280px] text-[14px] text-white/60">
              Already booked?{" "}
              <Link href="/account" className="font-semibold text-white underline decoration-brand underline-offset-4 hover:text-brand">My bookings</Link>
            </p>
            <p className="max-w-[280px] text-[14px] text-white/60">
              Travel agent, hotel or event company?{" "}
              <Link href="/partner" className="font-semibold text-white underline decoration-brand underline-offset-4 hover:text-brand">Partner login</Link>
            </p>
            <div className="flex gap-2.5">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener" aria-label={s.label} className="flex h-9 items-center justify-center rounded-lg border border-white/15 px-3 text-[13px] font-semibold text-white transition-colors hover:border-brand hover:bg-brand">
                  {s.label}
                </a>
              ))}
            </div>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.h} className="flex flex-col gap-2.5">
              <span className="font-mono text-[12px] font-semibold tracking-[0.16em] text-brand/80">{col.h.toUpperCase()}</span>
              {col.items.map((it) => (
                <a key={it.label} href={it.href} {...(it.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})} className="text-[15px] text-white/60 transition-colors hover:text-white">{it.label}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-[13px] text-white/50">
          <span>© 2026 Bagdrop Logistics Solutions Pvt. Ltd. All rights reserved. · <a href="/terms" className="hover:text-white">Terms</a> · <a href="/privacy" className="hover:text-white">Privacy</a> · <a href="/refund" className="hover:text-white">Refunds</a></span>
          <span className="font-mono tracking-wide">Mumbai · Delhi · Goa · Gujarat · Rajasthan · Hyderabad · Bangalore</span>
        </div>
      </div>
    </footer>
  );
}
