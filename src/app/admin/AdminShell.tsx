"use client";
import { DensityToggle } from "@/components/ui";
/** Admin OS shell — grouped sidebar + header, pixel-matched to the team's
 *  reference design ("Bagdrop Platform command.html": navy #1B2A4A rail,
 *  warm-paper #F7F5F2 canvas, Manrope/IBM Plex Mono type, orange #F25C05
 *  accent). Scoped entirely under the "admin-os" class (see globals.css)
 *  so none of this touches the booking site's own brand tokens. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLoad } from "@/lib/useLoad";
import { canView, MODULES, type Grants } from "@/lib/access";
import { MeProvider, PasswordForm, useSignOut, type Me } from "./session";

/* ---------- notifications bell — every platform event, live ---------- */
interface NotifRow { kind: string; key: string; to?: string; template?: string; text?: string; subject?: string; status: string; stub?: boolean; createdAt: string }

const SEEN_LS = "bagdrop:notifSeen";
/* the bell's "seen up to" mark lives in localStorage — read through a
 * subscription so other tabs stay in step and the server render is empty */
const subscribeSeen = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
const readSeen = () => { try { return localStorage.getItem(SEEN_LS) ?? ""; } catch { return ""; } };

/* sidebar look (glass colour set) — per browser, Midnight by default */
const LOOK_LS = "bagdrop:adminLook";
const LOOKS = [
  { key: "frost", name: "Frost" },
  { key: "midnight", name: "Midnight" },
  { key: "sunrise", name: "Sunrise" },
] as const;
const lookSubs = new Set<() => void>();
const subscribeLook = (cb: () => void) => { lookSubs.add(cb); window.addEventListener("storage", cb); return () => { lookSubs.delete(cb); window.removeEventListener("storage", cb); }; };
const readLook = () => { try { return localStorage.getItem(LOOK_LS) ?? "midnight"; } catch { return "midnight"; } };
const saveLook = (k: string) => { try { localStorage.setItem(LOOK_LS, k); } catch { /* private window */ } lookSubs.forEach((cb) => cb()); };
/** Client payment proofs stand out in green so finance never misses one. */
const isPaymentAlert = (r: NotifRow) => r.template === "ops_alert" && /PAYMENT PROOF|PAID ONLINE|\u{1F4B3}/u.test(r.text ?? "");

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
        className="relative flex h-9 cursor-pointer items-center justify-center rounded-lg border px-3 text-xs font-semibold"
        style={{ borderColor: "var(--a-line)", background: "var(--a-surface)" }}
      >
        Alerts
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
  | "cmd" | "ship" | "quote" | "lr" | "exc" | "evt" | "drv" | "flt" | "apt" | "cap"
  | "crm" | "price" | "id" | "fin" | "part"
  | "rules"
  | "integ" | "sec" | "data"
  | "dash" | "opsx" | "live" | "wed" | "ads" | "rep" | "insp" | "cli";

interface NavItem { key: ModuleKey; name: string; short?: string; badge?: string; badgeTone?: "live" | "count"; noHighlight?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { key: "cmd", short: "Centre", name: "Command centre", badge: "live", badgeTone: "live" },
      { key: "ship", short: "Ship", name: "Shipments · quotes & payments", badge: "live", badgeTone: "live" },
      { key: "lr", short: "LR", name: "LR & trips", badge: "live", badgeTone: "live" },
      { key: "opsx", short: "Ops", name: "Operations", badge: "live", badgeTone: "live" },
      { key: "live", short: "Live", name: "Live tracking", badge: "live", badgeTone: "live" },
      { key: "insp", short: "Inspect", name: "Tracking inspector", badge: "live", badgeTone: "live" },
      { key: "exc", short: "Issues", name: "Exceptions", badge: "live", badgeTone: "live" },
      { key: "wed", short: "Events", name: "Weddings & events", badge: "live", badgeTone: "live" },
      { key: "evt", short: "Bulk", name: "Bulk & manifest tools", badge: "live", badgeTone: "live" },
      { key: "drv", short: "Drivers", name: "Drivers", badge: "live", badgeTone: "live" },
      { key: "flt", short: "Flights", name: "Flights", badge: "live", badgeTone: "live" },
      { key: "apt", short: "Airport", name: "Airport desk · T2 POC", badge: "POC" },
      { key: "cap", short: "Roster", name: "Capacity & roster", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { key: "cli", short: "Clients", name: "Clients · master", badge: "live", badgeTone: "live" },
      { key: "crm", short: "CRM", name: "CRM & follow-ups", badge: "live", badgeTone: "live" },
      { key: "ads", short: "Leads", name: "Lead import · Ads", badge: "live", badgeTone: "live" },
      { key: "price", short: "Pricing", name: "Pricing engine", badge: "live", badgeTone: "live" },
      { key: "id", short: "Identity", name: "Identity & compliance", badge: "live", badgeTone: "live" },
      { key: "fin", short: "Finance", name: "Finance", badge: "live", badgeTone: "live" },
      { key: "part", short: "Partners", name: "Partners & API", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { key: "dash", short: "Boards", name: "Executive boards", badge: "live", badgeTone: "live" },
      { key: "rep", short: "Reports", name: "Reports & MIS", badge: "live", badgeTone: "live" },
      { key: "cmd", name: "Forecast & copilot", badge: "in Command centre", noHighlight: true },
      { key: "rules", short: "Rules", name: "Rules & notifications", badge: "live", badgeTone: "live" },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "integ", short: "Integr.", name: "Integrations", badge: "reference" },
      { key: "sec", short: "Security", name: "Security & audit", badge: "live", badgeTone: "live" },
      { key: "data", short: "Privacy", name: "Data & privacy", badge: "reference" },
    ],
  },
];


/** Rail: full on wide screens, collapsed (short labels) under 1440px; the
 *  choice is kept per browser. Focus mode hides the rail for data entry. */
const RAIL_KEY = "bagdrop-rail";
function readRail(): "full" | "collapsed" | null { try { const v = localStorage.getItem(RAIL_KEY); return v === "full" || v === "collapsed" ? v : null; } catch { return null; } }

/** Modules this login can open: their View box (modules outside the access list are for the owner key only). */
const visible = (g: Grants, k: ModuleKey) => (MODULES.some((m) => m.key === k) ? canView(g, k as Parameters<typeof canView>[1]) : g === "*");

export default function AdminShell(props: { tab: ModuleKey; setTab: (k: ModuleKey) => void; search: string; onSearchChange: (s: string) => void; children: ReactNode }) {
  return <MeProvider>{(me, reload) => <Shell {...props} me={me} reload={reload} />}</MeProvider>;
}

function Shell({
  tab, setTab, search, onSearchChange, children, me, reload,
}: { tab: ModuleKey; setTab: (k: ModuleKey) => void; search: string; onSearchChange: (s: string) => void; children: ReactNode; me: Me; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [rail, setRail] = useState<"full" | "collapsed">("full");
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved rail state lives in the browser only
    setRail(readRail() ?? (window.innerWidth >= 1024 && window.innerWidth < 1440 ? "collapsed" : "full"));
    try { const d = localStorage.getItem("bagdrop-density"); if (d === "compact") document.querySelector(".admin-os")?.setAttribute("data-density", d); } catch {}
  }, []);
  const toggleRail = () => setRail((r) => { const n = r === "full" ? "collapsed" : "full"; try { localStorage.setItem(RAIL_KEY, n); } catch {} return n; });
  const [desktop, setDesktop] = useState(true);
  useEffect(() => { const mq = window.matchMedia("(min-width: 1024px)"); const f = () => setDesktop(mq.matches); f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const collapsed = rail === "collapsed" && desktop;
  const look = useSyncExternalStore(subscribeLook, readLook, () => "midnight");
  const signOut = useSignOut();
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => visible(me.grants, i.key)) })).filter((g) => g.items.length);
  const allowed = groups.flatMap((g) => g.items);
  const current = allowed.find((i) => i.key === tab) ?? allowed[0];
  /* a module this login can't open: go to the first one it can */
  useEffect(() => { if (current && current.key !== tab) setTab(current.key); }, [current, tab, setTab]);
  if (!current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p><b>{me.name}</b>, your login has no modules ticked yet. Ask a manager to give you access in Security &amp; audit → Users.</p>
        <button className="cursor-pointer underline" onClick={() => void signOut()}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="admin-os flex min-h-screen" data-look={look} data-focus={focus ? "" : undefined}>

      {/* mobile toggle */}
      <button
        className="fixed left-3 top-3 z-50 flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-white lg:hidden"
        style={{ background: "var(--a-accent)" }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        Menu
      </button>

      <aside
        data-collapsed={collapsed ? "" : undefined}
        className={`a-rail fixed inset-y-0 left-0 z-40 w-[232px] shrink-0 overflow-y-auto p-3 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`pb-3 pt-11 lg:pt-1 ${collapsed ? "px-0 text-center" : "px-2"}`}>
          <div className="font-extrabold tracking-tight" style={{ fontFamily: "var(--a-display)", color: "var(--r-strong)", fontSize: collapsed ? 13 : 18 }}>
            {collapsed ? <>BD<span style={{ color: "var(--a-accent)" }}>.</span></> : <>BAG<span style={{ color: "var(--a-accent)" }}>DROP</span> OS</>}
          </div>
          {!collapsed && (
            <div className="mt-0.5 text-[10px] font-normal uppercase tracking-wider" style={{ fontFamily: "var(--a-mono)", color: "var(--r-label)" }}>
              one platform · one database
            </div>
          )}
          <button onClick={toggleRail} className="a-rail-toggle mt-2 hidden cursor-pointer lg:inline-block" aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}>{collapsed ? "Menu ›" : "‹ Collapse"}</button>
        </div>

        <nav>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="a-rail-group px-2 pb-1 pt-3 text-[10px] uppercase tracking-wider" style={{ fontFamily: "var(--a-mono)", color: "var(--r-label)" }}>{collapsed ? "" : g.label}</div>
              {g.items.map((item, i) => (
                <button
                  key={`${g.label}-${item.key}-${i}`}
                  onClick={() => { setTab(item.key); setOpen(false); }}
                  data-on={tab === item.key && !item.noHighlight ? "" : undefined}
                  title={item.name}
                  className={`a-rail-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] cursor-pointer ${tab === item.key && !item.noHighlight ? "font-semibold" : ""}`}
                >
                  <span>{collapsed ? (item.short ?? item.name.split(" ")[0]) : item.name}</span>
                  {item.badge && !collapsed && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        fontFamily: "var(--a-mono)",
                        background: tab === item.key && !item.noHighlight ? "rgba(255,255,255,.22)" : "var(--r-badge)",
                        color: tab === item.key && !item.noHighlight ? "#fff" : "var(--r-badge-fg)",
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

        <div className={`mt-3.5 border-t p-2.5 text-xs ${collapsed ? "hidden" : ""}`} style={{ borderColor: "var(--r-line)", color: "var(--r-label)" }}>
          <div className="font-semibold" style={{ fontFamily: "var(--a-display)", color: "var(--r-strong)" }}>{me.name}</div>
          <div>{me.owner ? "Emergency owner key — every use is logged" : me.user?.email}</div>
          <div className="mt-2 flex gap-3 text-[11px]">
            {!me.owner && <button className="cursor-pointer underline hover:text-[var(--r-strong)]" onClick={() => setPwOpen((v) => !v)}>Change password</button>}
            <button className="cursor-pointer underline hover:text-[var(--r-strong)]" onClick={() => void signOut()}>Sign out</button>
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-wider" style={{ fontFamily: "var(--a-mono)" }}>Look</div>
          <div className="mt-1 flex gap-1 rounded-lg p-0.5" style={{ background: "var(--r-badge)" }}>
            {LOOKS.map((l) => (
              <button key={l.key} onClick={() => saveLook(l.key)}
                className="flex-1 cursor-pointer rounded-md px-1.5 py-1 text-[11px]"
                style={look === l.key ? { background: "var(--r-active)", color: "#fff", fontWeight: 600 } : { color: "var(--r-fg)" }}>
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <main className="px-4 py-4 lg:px-6">
          <div className="a-topbar mb-4 flex flex-wrap items-center justify-between gap-2.5 pl-[68px] lg:pl-0">
            <div className="flex items-center gap-3">
              {focus && <button onClick={() => setFocus(false)} className="cursor-pointer rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold" style={{ borderColor: "var(--a-line)", background: "var(--a-surface)" }}>‹ Menu</button>}
              <div>
              <h1 style={{ fontFamily: "var(--a-display)" }}>{current.name}</h1>
              {current.key === "cmd" && (
                <div className="mt-0.5 max-w-[76ch] text-[13px]" style={{ color: "var(--a-muted)" }}>Everything moving right now. Reads from the event log, not from table scans.</div>
              )}
              </div>
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
              <DensityToggle />
              <button onClick={() => setFocus((v) => !v)} title="Hide the menu for data entry" className="hidden cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-semibold lg:inline" style={{ borderColor: "var(--a-line)", background: focus ? "var(--a-fg)" : "var(--a-surface)", color: focus ? "#fff" : "var(--a-fg)" }}>{focus ? "Exit focus" : "Focus"}</button>
              <span className="a-live hidden xl:inline">live feed</span>
            </div>
          </div>
          {pwOpen && (
            <div className="mb-4 max-w-sm rounded-xl border bg-white p-4" style={{ borderColor: "var(--a-line)" }}>
              <div className="mb-2 flex items-center justify-between"><b className="text-sm">Change your password</b><button className="cursor-pointer text-xs underline" onClick={() => setPwOpen(false)}>Close</button></div>
              <PasswordForm onDone={() => void reload()} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
