"use client";
/** Admin OS shell — grouped sidebar + header, pixel-matched to the team's
 *  reference design ("Bagdrop Platform command.html": navy #1B2A4A rail,
 *  warm-paper #F7F5F2 canvas, Manrope/IBM Plex Mono type, orange #F25C05
 *  accent). Scoped entirely under the "admin-os" class (see globals.css)
 *  so none of this touches the booking site's own brand tokens. */
import { useState, type ReactNode } from "react";

export type ModuleKey =
  | "cmd" | "ship" | "quote" | "lr" | "exc" | "evt" | "drv" | "flt" | "cap"
  | "crm" | "price" | "id" | "fin" | "part" | "prodleads"
  | "rules"
  | "integ" | "sec" | "data";

interface NavItem { key: ModuleKey; name: string; badge?: string; badgeTone?: "live" | "count"; noHighlight?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { key: "prodleads", name: "Production leads", badge: "bagdrop.co", badgeTone: "live" },
      { key: "cmd", name: "Command centre", badge: "live", badgeTone: "live" },
      { key: "ship", name: "Shipments", badge: "live", badgeTone: "live" },
      { key: "quote", name: "Quotes & payments", badge: "live", badgeTone: "live" },
      { key: "lr", name: "LR & trips", badge: "live", badgeTone: "live" },
      { key: "exc", name: "Exceptions", badge: "live", badgeTone: "live" },
      { key: "evt", name: "Events & bulk", badge: "live", badgeTone: "live" },
      { key: "drv", name: "Drivers", badge: "live", badgeTone: "live" },
      { key: "flt", name: "Flights", badge: "live", badgeTone: "live" },
      { key: "cap", name: "Capacity & roster", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { key: "crm", name: "CRM & follow-ups", badge: "live", badgeTone: "live" },
      { key: "price", name: "Pricing engine", badge: "live", badgeTone: "live" },
      { key: "id", name: "Identity & compliance", badge: "live", badgeTone: "live" },
      { key: "fin", name: "Finance", badge: "live", badgeTone: "live" },
      { key: "part", name: "Partners & API", badge: "reference" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { key: "cmd", name: "Forecast & copilot", badge: "in Command centre", noHighlight: true },
      { key: "rules", name: "Rules & notifications", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "integ", name: "Integrations", badge: "reference" },
      { key: "sec", name: "Security & audit", badge: "live", badgeTone: "live" },
      { key: "data", name: "Data & privacy", badge: "reference" },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

const FONTS =
  "https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

export default function AdminShell({
  tab, setTab, search, onSearchChange, children,
}: { tab: ModuleKey; setTab: (k: ModuleKey) => void; search: string; onSearchChange: (s: string) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const current = ALL_ITEMS.find((i) => i.key === tab) ?? ALL_ITEMS[0];

  return (
    <div className="admin-os flex min-h-screen">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href={FONTS} />

      {/* mobile toggle */}
      <button
        className="fixed left-3 top-3 z-50 flex size-9 items-center justify-center rounded-lg text-white lg:hidden"
        style={{ background: "var(--a-navy)" }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[232px] overflow-y-auto p-3 text-white transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--a-navy)" }}
      >
        <div className="px-2 pb-3.5 pt-1">
          <div className="text-lg font-extrabold tracking-tight" style={{ fontFamily: "var(--a-display)" }}>
            BAG<span style={{ color: "var(--a-accent)" }}>DROP</span> Admin OS
          </div>
          <div className="mt-0.5 text-[10px] font-normal uppercase tracking-wider text-white/70" style={{ fontFamily: "var(--a-mono)" }}>
            one platform · one database · rev 2
          </div>
        </div>

        <nav>
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-wider text-white/55" style={{ fontFamily: "var(--a-mono)" }}>{g.label}</div>
              {g.items.map((item, i) => (
                <button
                  key={`${g.label}-${item.key}-${i}`}
                  onClick={() => { setTab(item.key); setOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] cursor-pointer ${
                    tab === item.key && !item.noHighlight ? "font-semibold" : "text-white/92 hover:bg-white/10"
                  }`}
                  style={tab === item.key && !item.noHighlight ? { background: "var(--a-accent)", color: "#fff" } : undefined}
                >
                  <span>{item.name}</span>
                  {item.badge && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        fontFamily: "var(--a-mono)",
                        background: tab === item.key && !item.noHighlight ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.14)",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-3.5 border-t border-white/15 p-2.5 text-xs text-white/85">
          <div className="font-semibold" style={{ fontFamily: "var(--a-display)" }}>Bagdrop Ops</div>
          <div>Admin console</div>
          <div className="mt-0.5 text-[11px] text-white/55" style={{ fontFamily: "var(--a-mono)" }}>live session</div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <main className="px-4 py-4.5 lg:px-5.5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 pl-10 lg:pl-0">
            <div>
              <h1 className="text-[22px] font-extrabold" style={{ fontFamily: "var(--a-display)" }}>{current.name}</h1>
              {current.key === "cmd" && (
                <div className="mt-0.5 max-w-[76ch] text-[13px]" style={{ color: "var(--a-muted)" }}>Everything moving right now. Reads from the event log, not from table scans.</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search shipment, LR, name, phone…"
                aria-label="Global search"
                className="min-w-[220px] rounded-lg border px-3 py-2 text-[13px]"
                style={{ borderColor: "var(--a-line)", background: "var(--a-surface)", color: "var(--a-fg)" }}
              />
              <a href="/" target="_blank" rel="noreferrer" className="hidden rounded-lg border px-3 py-2 text-[13px] sm:inline" style={{ borderColor: "var(--a-line)", background: "var(--a-surface)" }}>
                View booking site
              </a>
              <span className="a-live">live feed</span>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
