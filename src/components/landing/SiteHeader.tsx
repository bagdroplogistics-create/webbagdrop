"use client";
import { useState } from "react";
import Image from "next/image";
import { NAV } from "./data";
import { Icon } from "./Icon";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <Image src="/images/logo-icon.png" alt="" width={28} height={28} className="h-7 w-7" priority />
          <span className="flex flex-col leading-none">
            <span className="font-display text-base font-extrabold tracking-tight text-ink">
              BAG<span className="text-brand">DROP</span>
            </span>
            <span className="font-mono text-[9px] tracking-[0.2em] text-faint">BAG. BOX. DELIVERED.</span>
          </span>
        </a>

        <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-graphite md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="transition-colors hover:text-brand">{n.label}</a>
          ))}
        </nav>

        <a
          href="#book"
          className="hidden items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark sm:inline-flex"
        >
          Book Now <Icon name="arrow" size={15} />
        </a>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex size-10 items-center justify-center rounded-lg text-ink md:hidden"
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-canvas px-4 pb-5 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 text-[15px] font-medium text-graphite hover:bg-paper hover:text-ink">
                {n.label}
              </a>
            ))}
            <a href="#book" onClick={() => setOpen(false)} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white">
              Book Now <Icon name="arrow" size={15} />
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
