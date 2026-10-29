"use client";
/** The read-only department board a head opens from their link. Same board
 *  components as the BAGDROP OS Dashboard, minus navigation (there is nothing
 *  to navigate to without an admin session). Polls every 60 s; period
 *  switcher and WhatsApp/email/PNG sharing included. */
import { useCallback, useEffect, useState } from "react";
import type { Metrics, Period, ViewKey } from "@/lib/metricsTypes";
import { PERIODS, VIEWS } from "@/lib/metricsTypes";
import { Board } from "@/app/admin/boards";
import ShareBar from "@/app/admin/ShareBar";

export default function HeadBoard({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("today");
  const [view, setView] = useState<ViewKey | null>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    try {
      const r = await fetch(`/api/board/metrics?token=${encodeURIComponent(token)}&period=${p}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
      setView(j.view as ViewKey); setM(j.metrics as Metrics); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [token]);
  useEffect(() => { void load(period); const t = setInterval(() => void load(period), 60000); return () => clearInterval(t); }, [period, load]);

  const name = view ? VIEWS.find((v) => v.key === view)?.name : null;

  return (
    <div className="min-h-screen bg-paper/60">
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl flex-wrap items-center gap-2.5 px-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">B</span>
          <span className="font-display text-sm font-extrabold tracking-tight">
            BAGDROP <span className="text-brand">{name ? `${name} board` : "Board"}</span>
          </span>
          <span className="rounded-full bg-paper px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">read-only</span>
          <span className="ml-auto flex items-center gap-1.5">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${period === p.key ? "bg-brand text-white" : "bg-paper text-muted hover:bg-stone-200"}`}>
                {p.name}
              </button>
            ))}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {err === "LINK_EXPIRED_OR_INVALID" ? (
          <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
            <h1 className="font-display text-lg font-bold">This board link has expired.</h1>
            <p className="mt-2 text-sm text-muted">Ask the Bagdrop admin to send you a fresh one from the BAGDROP OS Dashboard.</p>
          </div>
        ) : err ? (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load the board:</b> {err}</p>
        ) : !m || !view ? (
          <p className="text-sm text-muted">Reading the numbers…</p>
        ) : (
          <div key={view + period} className="anim-in grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted">
                {name} · {m.periodLabel} · as of {new Date(m.asOf).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                <span className="ml-2 text-faint">deltas vs previous {m.periodLabel.toLowerCase()} · refreshes every 60 s</span>
              </p>
              <ShareBar view={view} m={m} />
            </div>
            <Board view={view} m={m} />
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-[11px] text-faint">
        BAGDROP OS · this link shows one department&apos;s live numbers, read-only.
      </footer>
    </div>
  );
}
