"use client";
/** Admin OS · Command centre — today's numbers, the event feed, what needs a
 *  decision, and a few real anomaly heuristics. All computed client-side
 *  from the live bookings list; no external AI call (see src/lib/intelligence.ts). */
import { useEffect, useState } from "react";
import { inr } from "@/lib/pricing";
import { anomalies, brief, forecast, stats, type Forecast, type Notice, type Stats } from "@/lib/intelligence";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

const LABEL: Record<string, string> = {
  quoted: "quoted", identified: "verified", submitted: "needs decision", revised: "revised",
  accepted: "accepted", assigned: "captain assigned", picked_up: "picked up",
  in_transit: "in transit", delivered: "delivered", rejected: "rejected", cancelled: "cancelled",
};

/** Date.now()-dependent (forecast/stats) so it's computed in an effect, never
 *  during render — Next's Cache Components flags a bare Date.now() read in a
 *  Client Component's render path even when the component is purely client. */
interface Computed { s: Stats; notices: Notice[]; fc: Forecast; briefText: string; feed: (Booking["events"][number] & { bookingId: string })[] }

export default function CommandCentre() {
  const [all, setAll] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);

  const [computed, setComputed] = useState<Computed | null>(null);
  useEffect(() => {
    const s = stats(all);
    const notices = anomalies(all);
    const fc = forecast(all);
    const feed = all
      .flatMap((b) => b.events.map((e) => ({ ...e, bookingId: b.id })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);
    setComputed({ s, notices, fc, briefText: brief(s, notices), feed });
  }, [all]);

  if (!computed) return <p className="text-sm text-muted">Reading the day…</p>;
  const { s, notices, fc, briefText, feed } = computed;
  const needsDecision = all.filter((b) => b.status === "submitted").slice(0, 8);
  const maxPieces = Math.max(1, ...fc.history.map((h) => h.actual), ...fc.future.map((f) => f.hi ?? 0));

  return (
    <div className="grid gap-5">
      {err && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
          <b>Couldn&apos;t load bookings:</b> {err}
        </p>
      )}

      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">
          Today&apos;s brief <span className="ml-2 text-xs font-normal text-faint">computed live from the booking platform</span>
        </h3>
        <p className="text-sm text-muted">{briefText}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Bookings today" value={String(s.today)} />
        <Kpi label="Needs decision" value={String(s.needsDecision)} />
        <Kpi label="Paid today" value={inr(s.paidToday)} />
        <Kpi label="In custody" value={String(s.inCustody)} hint="picked up, not delivered" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Quoted, unpaid" value={String(s.quotedUnpaid)} />
        <Kpi label="Revised, waiting" value={String(s.revisedWaiting)} />
        <Kpi label="Delivered, total" value={String(s.delivered)} hint="all time" />
        <Kpi label="Total bookings" value={String(s.total)} hint="all time" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h3 className="mb-1 font-display text-sm font-bold">Pieces per day</h3>
          <p className="mb-3 text-xs text-muted">{fc.note}</p>
          <div className="flex h-36 items-end gap-1">
            {fc.history.map((h) => (
              <div key={h.day} className="flex-1" title={`${h.day} · ${h.actual} pieces`}>
                <div className="rounded-t bg-brand/70" style={{ height: `${Math.max(2, (h.actual / maxPieces) * 100)}%` }} />
              </div>
            ))}
            {fc.future.slice(0, 7).map((f) => (
              <div key={f.day} className="flex-1" title={`${f.day} · forecast ${Math.round(f.mu ?? 0)} (${Math.round(f.lo ?? 0)}–${Math.round(f.hi ?? 0)})`}>
                <div className="rounded-t border border-dashed border-brand/60 bg-brand/15" style={{ height: `${Math.max(2, ((f.mu ?? 0) / maxPieces) * 100)}%` }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-faint">solid = actual, last 14 days · dashed = forecast, next 7 days · next week ≈ {fc.weekTotal} pieces · ~{fc.captainsNeeded} captain{fc.captainsNeeded === 1 ? "" : "s"} needed</p>
        </Card>
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Event feed <span className="font-normal text-faint">last 20</span></h3>
          <div className="max-h-72 space-y-2 overflow-auto">
            {feed.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
            {feed.map((e, i) => (
              <div key={i} className="border-b border-dashed border-line pb-2 text-xs last:border-0">
                <span className="text-faint">{new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {" · "}
                <span className="font-mono text-[11px]">{e.bookingId}</span> — {e.text}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Needs a decision</h3>
          {needsDecision.length === 0 && <p className="text-sm text-muted">Nothing waiting.</p>}
          <ul className="space-y-1.5">
            {needsDecision.map((b) => (
              <li key={b.id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{b.id}</span>
                <span className="text-muted">{b.from} → {b.to} · {inr(b.quote.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Copilot noticed</h3>
          {notices.length === 0 && <p className="text-sm text-muted">Quiet.</p>}
          <ul className="space-y-1.5">
            {notices.map((n, i) => (
              <li key={i} className="text-xs">
                <Badge tone={n.sev === "warn" ? "warn" : "info"}>{n.sev}</Badge> <span className="text-muted">{n.text}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Today&apos;s numbers</h3>
          <ul className="space-y-1.5 text-xs">
            {Object.entries(LABEL).map(([status, label]) => {
              const n = all.filter((b) => b.status === status).length;
              return n > 0 ? (
                <li key={status} className="flex justify-between">
                  <span className="text-muted">{label}</span><span className="font-semibold">{n}</span>
                </li>
              ) : null;
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="block font-display text-xl font-extrabold">{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
