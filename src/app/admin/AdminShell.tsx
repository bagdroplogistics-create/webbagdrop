"use client";
/** Admin OS shell — grouped sidebar + header, pixel-matched to the team's
 *  reference design ("Bagdrop Platform command.html": navy #1B2A4A rail,
 *  warm-paper #F7F5F2 canvas, Manrope/IBM Plex Mono type, orange #F25C05
 *  accent). Scoped entirely under the "admin-os" class (see globals.css)
 *  so none of this touches the booking site's own brand tokens. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLoad } from "@/lib/useLoad";

/* ---------- notifications bell — every platform event, live ---------- */
interface NotifRow { kind: string; key: string; to?: string; template?: string; text?: string; subject?: string; status: string; stub?: boolean; createdAt: string }

const SEEN_LS = "bagdrop:notifSeen";
/* the bell's "seen up to" mark lives in localStorage — read through a
 * subscription so other tabs stay in step and the server render is empty */
const subscribeSeen = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
const readSeen = () => { try { return localStorage.getItem(SEEN_LS) ?? ""; } catch { return ""; } };
/** Client payment proofs stand out in green so finance never misses one. */
const isPaymentAlert = (r: NotifRow) => r.template === "ops_alert" && /PAYMENT PROOF|💳/.test(r.text ?? "");

function NotificationsBell() {
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [open, setOpen] = useState(false);
  const storedSeen = useSyncExternalStore(subscribeSeen, readSeen, () => "");
  const [markedSeen, setSeenAt] = useState<string | null>(null);
  const seenAt = markedSeen ?? storedSeen;
  const panelRef = useRef<HTMLDivElement>(null);


  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/automation");
      if (!r.ok) return;
      const j = await r.json();
      /* one entry per event key (wa+em pairs collapse); ops alerts lead */
      const seen = new Set<string>();
      const list: NotifRow[] = [];
      for (const e of (j.recent ?? []) as NotifRow[]) {
        const base = e.key.replace(/:(wa|em)$/, "");
        if (seen.has(base)) continue;
        seen.add(base);
        list.push(e);
      }
      setRows(list.slice(0, 20));
    } catch { /* next poll */ }
  }, []);
  useLoad(load, 20000);

  useEffect(() => {
    if (!open) return;
    const h = (ev: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const unseen = rows.filter((r) => r.createdAt > seenAt).length;
  const unseenPay = rows.filter((r) => r.createdAt > seenAt && isPaymentAlert(r)).length;
  function toggle() {
    setOpen((o) => {
      if (!o && rows[0]) {
        try { localStorage.setItem(SEEN_LS, rows[0].createdAt); } catch { /* fine */ }
        setSeenAt(rows[0].createdAt);
      }
      return !o;
    });
  }
  const label = (r: NotifRow) => {
    const t = r.text ?? "";
    if (r.template === "ops_alert") return t;
    return `${(r.template ?? r.kind).replace(/_/g, " ")} → ${r.to ?? ""} · ${t.slice(0, 90)}`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        aria-label={`Notifications${unseen ? ` · ${unseen} new` : ""}`}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border text-[15px]"
        style={{ borderColor: "var(--a-line)", background: "var(--a-surface)" }}
      >
        🔔
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: unseenPay ? "#059669" : "var(--a-accent)", height: 18, animation: "a-pulse 2s ease-in-out infinite" }}>
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      {open && (
        <div className="anim-in absolute right-0 top-11 z-50 w-[360px] max-w-[88vw] overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: "var(--a-line)", background: "var(--a-surface)", boxShadow: "0 12px 40px -12px rgba(25,30,50,.25)" }}>
          <div className="flex items-center justify-between border-b px-3.5 py-2.5" style={{ borderColor: "var(--a-line)" }}>
            <b className="text-[13px]" style={{ fontFamily: "var(--a-display)" }}>Notifications</b>
            <span className="text-[10.5px]" style={{ color: "var(--a-muted)", fontFamily: "var(--a-mono)" }}>every event · WhatsApp + email fan-out</span>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {rows.length === 0 && <p className="p-4 text-center text-xs" style={{ color: "var(--a-muted)" }}>Nothing yet — events appear here the moment they happen.</p>}
            {rows.map((r, i) => {
              const money = isPaymentAlert(r);
              return (
              <div key={r.key} className="anim-in border-b px-3.5 py-2.5 text-xs last:border-0"
                style={{ borderColor: "var(--a-line)", animationDelay: `${i * 25}ms`, ...(money ? { background: "#ECFDF5", borderLeft: "4px solid #059669" } : {}) }}>
                {money && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#047857" }}>Payment · verify in Finance</p>}
                <p className="leading-snug" style={{ color: money ? "#064E3B" : "var(--a-fg)" }}>{label(r)}</p>
                <p className="mt-0.5 flex justify-between text-[10.5px]" style={{ color: "var(--a-muted)", fontFamily: "var(--a-mono)" }}>
                  <span>{new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{r.kind === "send.wa" ? "WhatsApp" : r.kind === "send.email" ? "email" : "note"}{r.stub ? " · stub" : ""} · {r.status}</span>
                </p>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type ModuleKey =
  | "cmd" | "ship" | "quote" | "lr" | "exc" | "evt" | "drv" | "flt" | "cap"
  | "crm" | "price" | "id" | "fin" | "part"
  | "rules"
  | "integ" | "sec" | "data"
  | "dash" | "opsx" | "wed" | "ads" | "rep" | "insp" | "cli";

interface NavItem { key: ModuleKey; name: string; badge?: string; badgeTone?: "live" | "count"; noHighlight?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { key: "cmd", name: "Command centre", badge: "live", badgeTone: "live" },
      { key: "ship", name: "Shipments · quotes & payments", badge: "live", badgeTone: "live" },
      { key: "lr", name: "LR & trips", badge: "live", badgeTone: "live" },
      { key: "opsx", name: "Operations", badge: "live", badgeTone: "live" },
      { key: "insp", name: "Tracking inspector", badge: "live", badgeTone: "live" },
      { key: "exc", name: "Exceptions", badge: "live", badgeTone: "live" },
      { key: "wed", name: "Weddings & events", badge: "live", badgeTone: "live" },
      { key: "evt", name: "Bulk & manifest tools", badge: "live", badgeTone: "live" },
      { key: "drv", name: "Drivers", badge: "live", badgeTone: "live" },
      { key: "flt", name: "Flights", badge: "live", badgeTone: "live" },
      { key: "cap", name: "Capacity & roster", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { key: "cli", name: "Clients · master", badge: "live", badgeTone: "live" },
      { key: "crm", name: "CRM & follow-ups", badge: "live", badgeTone: "live" },
      { key: "ads", name: "Lead import · Ads", badge: "live", badgeTone: "live" },
      { key: "price", name: "Pricing engine", badge: "live", badgeTone: "live" },
      { key: "id", name: "Identity & compliance", badge: "live", badgeTone: "live" },
      { key: "fin", name: "Finance", badge: "live", badgeTone: "live" },
      { key: "part", name: "Partners & API", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { key: "dash", name: "Executive boards", badge: "live", badgeTone: "live" },
      { key: "rep", name: "Reports & MIS", badge: "live", badgeTone: "live" },
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
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";

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
        style={{ background: "var(--a-accent)" }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[232px] overflow-y-auto p-3 transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--a-navy)", color: "#B9C4D9", boxShadow: "2px 0 20px -8px rgba(13,23,48,.35)" }}
      >
        <div className="px-2 pb-3.5 pt-1">
          <div className="text-lg font-extrabold tracking-tight text-white" style={{ fontFamily: "var(--a-display)" }}>
            BAG<span style={{ color: "#FF7A33" }}>DROP</span> OS
          </div>
          <div className="mt-0.5 text-[10px] font-normal uppercase tracking-wider" style={{ fontFamily: "var(--a-mono)", color: "#7E8DA8" }}>
            one platform · one database · rev 2
          </div>
        </div>

        <nav>
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-wider" style={{ fontFamily: "var(--a-mono)", color: "#6E7D99" }}>{g.label}</div>
              {g.items.map((item, i) => (
                <button
                  key={`${g.label}-${item.key}-${i}`}
                  onClick={() => { setTab(item.key); setOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] cursor-pointer ${
                    tab === item.key && !item.noHighlight ? "font-semibold" : "hover:bg-[#24355A] hover:text-white"
                  }`}
                  style={tab === item.key && !item.noHighlight ? { background: "var(--a-accent)", color: "#fff" } : { color: "#B9C4D9" }}
                >
                  <span>{item.name}</span>
                  {item.badge && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        fontFamily: "var(--a-mono)",
                        background: tab === item.key && !item.noHighlight ? "rgba(255,255,255,.22)" : "#2A3B61",
                        color: tab === item.key && !item.noHighlight ? "#fff" : "#AEBBD4",
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

        <div className="mt-3.5 border-t p-2.5 text-xs" style={{ borderColor: "#2A3B61", color: "#8C9AB5" }}>
          <div className="font-semibold text-white" style={{ fontFamily: "var(--a-display)" }}>Bagdrop Ops</div>
          <div>Admin console</div>
          <div className="mt-0.5 text-[11px]" style={{ fontFamily: "var(--a-mono)", color: "#6E7D99" }}>live session</div>
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
              <NotificationsBell />
              <span className="a-live">live feed</span>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
