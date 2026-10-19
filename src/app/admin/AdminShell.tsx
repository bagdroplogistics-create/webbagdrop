"use client";
/** Admin OS shell — grouped sidebar + header, matching the reference layout
 *  the team supplied (navy sidebar with OPERATE/COMMERCE/INTELLIGENCE/
 *  PLATFORM groups, a header bar with quick links and a live-feed dot).
 *  Swaps in for the old flat pill-tab nav; every module's own content is
 *  unchanged — only the surrounding chrome moved. */
import { useState, type ReactNode } from "react";

export type ModuleKey =
  | "cmd" | "ship" | "quote" | "lr" | "exc" | "evt" | "drv" | "flt" | "cap"
  | "crm" | "price" | "id" | "fin" | "part"
  | "rules"
  | "integ" | "sec" | "data";

interface NavItem { key: ModuleKey; name: string; badge?: string; badgeTone?: "live" | "count"; noHighlight?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { key: "cmd", name: "Command centre", badge: "live", badgeTone: "live" },
      { key: "ship", name: "Shipments", badge: "live", badgeTone: "live" },
      { key: "quote", name: "Quotes & payments", badge: "live", badgeTone: "live" },
      { key: "lr", name: "LR & trips", badge: "live", badgeTone: "live" },
      { key: "exc", name: "Exceptions" },
      { key: "evt", name: "Events & bulk" },
      { key: "drv", name: "Drivers", badge: "GPS" },
      { key: "flt", name: "Flights" },
      { key: "cap", name: "Capacity & roster" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { key: "crm", name: "CRM & follow-ups", badge: "live", badgeTone: "live" },
      { key: "price", name: "Pricing engine", badge: "live", badgeTone: "live" },
      { key: "id", name: "Identity & compliance" },
      { key: "fin", name: "Finance", badge: "live", badgeTone: "live" },
      { key: "part", name: "Partners & API" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { key: "cmd", name: "Forecast & copilot", badge: "in Command centre", noHighlight: true },
      { key: "rules", name: "Rules & notifications" },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "integ", name: "Integrations" },
      { key: "sec", name: "Security & audit" },
      { key: "data", name: "Data & privacy" },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

export default function AdminShell({ tab, setTab, children }: { tab: ModuleKey; setTab: (k: ModuleKey) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const current = ALL_ITEMS.find((i) => i.key === tab) ?? ALL_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* mobile toggle */}
      <button
        className="fixed left-3 top-3 z-50 flex size-9 items-center justify-center rounded-lg bg-ink text-white lg:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <aside className={`fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-ink text-white transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-5">
          <div className="font-display text-lg font-extrabold tracking-tight">
            BAG<span className="text-brand">DROP</span> <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brand">ADMIN</span>
          </div>
          <div className="mt-3 text-sm font-bold">BAGDROP Admin OS</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/40">one platform · one database</div>
        </div>

        <nav className="px-3 pb-4">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-white/35">{g.label}</div>
              {g.items.map((item, i) => (
                <button
                  key={`${g.label}-${item.key}-${i}`}
                  onClick={() => { setTab(item.key); setOpen(false); }}
                  className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors cursor-pointer ${
                    tab === item.key && !item.noHighlight ? "bg-brand text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${item.badgeTone === "live" ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/50"}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4 text-[11px] text-white/40">
          <div className="font-semibold text-white/70">Bagdrop Logistics</div>
          <div>Admin console · real data</div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 lg:pl-0">
        <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-4 pl-14 lg:pl-6">
            <h1 className="truncate font-display text-base font-bold">{current.name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted">
              <a href="/" target="_blank" rel="noreferrer" className="hidden text-brand hover:underline sm:inline">View booking site</a>
              <span className="hidden sm:inline">·</span>
              <span className="flex items-center gap-1.5">
                <i className="size-1.5 rounded-full bg-green-500" /> live feed
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
