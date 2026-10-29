"use client";
/** Admin OS · Executive dashboard — the default board. One fetch returns
 *  every department's numbers for the chosen period; the view selector
 *  flips between the CEO board and department boards without refetching.
 *  Each board: KPI deltas vs the previous period, a 14-day trend, its own
 *  attention list with record drill-downs, WhatsApp/email/PNG sharing —
 *  plus a generator for read-only, department-scoped links to send each
 *  department head. */
import { useCallback, useEffect, useState } from "react";
import type { Metrics, Period, ViewKey } from "@/lib/metricsTypes";
import { PERIODS, VIEWS } from "@/lib/metricsTypes";
import { Button, Card, Select } from "@/components/ui";
import { Board } from "./boards";
import ShareBar from "./ShareBar";

export default function Executive({ openModule, openBooking }: { openModule?: (key: string) => void; openBooking?: (id: string) => void }) {
  const [period, setPeriod] = useState<Period>("today");
  const [view, setView] = useState<ViewKey>("ceo");
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    try {
      const r = await fetch(`/api/admin/metrics?period=${p}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP_${r.status}`);
      setM(await r.json()); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(period); const t = setInterval(() => void load(period), 30000); return () => clearInterval(t); }, [period, load]);

  if (err) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load metrics:</b> {err}</p>;
  if (!m) return <p className="text-sm text-muted">Reading the company…</p>;

  const nav = (module: string, id?: string) => {
    if (id && (module === "ship" || module === "fin")) { openBooking?.(id); return; }
    openModule?.(module);
  };

  return (
    <div className="grid gap-5">
      {/* selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${view === v.key ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>
              {v.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${period === p.key ? "bg-brand text-white" : "bg-paper text-muted hover:bg-stone-200"}`}>
              {p.name}
            </button>
          ))}
          <span className="ml-2 hidden text-[11px] text-faint sm:block">live · refreshes every 30 s · deltas vs previous {m.periodLabel.toLowerCase()}</span>
        </div>
      </div>

      {/* the board — keyed by view so it crossfades on switch */}
      <div key={view + period} className="anim-in grid gap-5">
        <Board view={view} m={m} onNav={nav} />

        {/* ticker + share + head links */}
        <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
          <Card>
            <h3 className="mb-2 font-display text-sm font-bold">Live ticker <span className="font-normal text-faint">latest activity, all modules</span></h3>
            <div className="max-h-48 space-y-1.5 overflow-auto">
              {m.feed.length === 0 && <p className="text-sm text-muted">Quiet.</p>}
              {m.feed.map((e, i) => (
                <div key={e.at + e.id} className={`border-b border-dashed border-line pb-1.5 text-xs last:border-0 ${i === 0 ? "anim-in" : ""}`}>
                  <span className="text-faint">{new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {" · "}
                  <button type="button" className="cursor-pointer font-mono text-[11px] text-brand hover:underline" onClick={() => openBooking?.(e.id)}>{e.id}</button>
                  {" — "}{e.text}
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-5">
            <Card>
              <h3 className="mb-2 font-display text-sm font-bold">Share this board</h3>
              <p className="mb-3 text-xs text-muted">Sends exactly what you see — {VIEWS.find((v) => v.key === view)?.name} · {m.periodLabel}, stamped {new Date(m.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Snapshot gives a branded PNG for WhatsApp groups or email.</p>
              <ShareBar view={view} m={m} />
            </Card>
            <HeadLinks />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mint read-only department board links for the heads. */
function HeadLinks() {
  const [view, setView] = useState<ViewKey>("ops");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true); setMsg(""); setLink(null);
    try {
      const r = await fetch("/api/admin/board-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, days: Number(days) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
      setLink({ url: `${location.origin}${j.path}`, expires: j.expires });
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">Department head links</h3>
      <p className="mb-3 text-xs text-muted">A signed, expiring, <b>read-only</b> link to one department&apos;s live board — no admin login, no write access, no other department&apos;s numbers.</p>
      <div className="mb-2 flex gap-2">
        <Select value={view} onChange={(e) => setView(e.target.value as ViewKey)} className="flex-1 !py-2 !text-xs">
          {VIEWS.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
        </Select>
        <Select value={days} onChange={(e) => setDays(e.target.value)} className="w-28 !py-2 !text-xs">
          <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
        </Select>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void create()}>{busy ? "Creating…" : "Create link"}</Button>
      {msg && <p className="mt-2 text-xs text-red-700">{msg}</p>}
      {link && (
        <div className="mt-3 rounded-xl bg-paper p-2.5">
          <p className="break-all font-mono text-[11px] text-ink">{link.url}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => { navigator.clipboard?.writeText(link.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>
              {copied ? "Copied ✓" : "Copy link"}
            </Button>
            <span className="text-[11px] text-faint">valid till {new Date(link.expires).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
