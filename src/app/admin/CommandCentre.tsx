"use client";
/** Admin OS · Command centre — today's numbers, the event feed, what needs a
 *  decision, and a few real anomaly heuristics. All computed client-side
 *  from the live bookings list; no external AI call (see src/lib/intelligence.ts).
 *  Visually matched to the team's reference design ("Bagdrop Platform
 *  command.html") — the stripe-coloured cards, the KPI row, the event-feed
 *  dots and the "Network now" panel all follow its exact markup/CSS. The
 *  map itself is the same honest exception the reference design plan notes
 *  elsewhere for Drivers: no live GPS feed wired up, so it's a schematic,
 *  not real vehicle telemetry — everything else on this page is real data. */
import { useEffect, useState } from "react";
import { inr } from "@/lib/pricing";
import { anomalies, brief, stats, type Notice, type Stats } from "@/lib/intelligence";
import { watchAdminBookings } from "@/lib/adminApi";
import { watchEvents } from "@/lib/eventsApi";
import type { Booking, WeddingEvent } from "@/lib/types";
import { deriveExceptions } from "./Exceptions";
import { CAPTAINS } from "./Drivers";

/** AMD hub → BRD hub → MUM hub, same backbone as the map's lane path
 *  (M80,120 L300,150 L520,90) — used to place each captain's marker at
 *  a schematic point along the lane their job is on, alternating legs. */
const LANES = [
  { from: { x: 80, y: 120 }, to: { x: 300, y: 150 } },
  { from: { x: 300, y: 150 }, to: { x: 520, y: 90 } },
] as const;
function laneLerp(i: number, t: number) {
  const lane = LANES[i % LANES.length];
  return { x: lane.from.x + (lane.to.x - lane.from.x) * t, y: lane.from.y + (lane.to.y - lane.from.y) * t };
}

const LABEL: Record<string, string> = {
  quoted: "quoted", identified: "verified", submitted: "needs decision", revised: "revised",
  accepted: "accepted", assigned: "captain assigned", picked_up: "picked up",
  in_transit: "in transit", delivered: "delivered", rejected: "rejected", cancelled: "cancelled",
};

/** Date.now()-dependent (forecast/stats/today-key) so it's computed in an
 *  effect, never during render — Next's Cache Components flags a bare
 *  Date.now() read in a Client Component's render path. */
interface Computed {
  s: Stats; notices: Notice[]; briefText: string;
  feed: (Booking["events"][number] & { bookingId: string })[];
  pickupsNext24h: number; cutoffsToday: number; exceptionsOpen: number;
}

export default function CommandCentre() {
  const [all, setAll] = useState<Booking[]>([]);
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => watchEvents(setEvents, () => {}), []);

  const [computed, setComputed] = useState<Computed | null>(null);
  useEffect(() => {
    const s = stats(all);
    const notices = anomalies(all);
    const feed = all
      .flatMap((b) => b.events.map((e) => ({ ...e, bookingId: b.id })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);
    const todayKey = new Date().toISOString().slice(0, 10);
    const activeStatuses = ["quoted", "identified", "submitted", "revised", "accepted", "assigned"];
    const pickupsNext24h = all.filter((b) => (b.pickupDate || b.date) === todayKey && activeStatuses.includes(b.status)).length;
    const cutoffsToday = all.filter((b) => b.date === todayKey && (b.mode === "air" || b.mode === "rail" || b.mode === "sea")).length;
    const exceptionsOpen = deriveExceptions(all).length;
    setComputed({ s, notices, briefText: brief(s, notices), feed, pickupsNext24h, cutoffsToday, exceptionsOpen });
  }, [all]);

  if (!computed) return <p className="text-sm" style={{ color: "var(--a-muted)" }}>Reading the day…</p>;
  const { s, notices, briefText, feed, pickupsNext24h, cutoffsToday, exceptionsOpen } = computed;
  const needsDecision = all.filter((b) => b.status === "submitted").slice(0, 8);
  const eventsOpen = events.filter((e) => e.status === "open").length;

  const onRunStatuses = ["assigned", "picked_up", "in_transit"];
  const captainJobs = CAPTAINS.map((c, i) => {
    const job = all.find((b) => onRunStatuses.includes(b.status) && (b.admin as Record<string, unknown>).captain === c.name);
    if (!job) return null;
    const pos = laneLerp(i, 0.3 + (i % 2) * 0.35);
    return { name: c.name, pcs: job.bags + job.oversize, id: job.id, x: pos.x, y: pos.y };
  }).filter((x): x is { name: string; pcs: number; id: string; x: number; y: number } => x !== null);

  return (
    <div className="grid gap-3">
      {err && (
        <p className="a-card text-sm" style={{ background: "var(--a-bad-bg)", color: "var(--a-bad)", borderColor: "transparent" }}>
          <b>Couldn&apos;t load bookings:</b> {err}
        </p>
      )}

      <div className="a-card" style={{ background: "var(--a-navy)", color: "#fff", border: 0 }}>
        <H3 r="written by the intelligence engine from the live database">Today&apos;s brief</H3>
        <p className="min-h-[40px] text-sm" style={{ color: "rgba(255,255,255,.88)" }}>{briefText}</p>
      </div>

      <div className="a-card a-stripe a-stripe-ok">
        <H3 live r="bookings and events written by customers and families">Live from the booking platform</H3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Bookings today" value={String(s.today)} />
          <Kpi label="Needs decision" value={String(s.needsDecision)} />
          <Kpi label="Paid today" value={inr(s.paidToday)} />
          <Kpi label="Events open" value={String(eventsOpen)} />
        </div>
        <div className="mt-1.5 text-[11px]" style={{ fontFamily: "var(--a-mono)", color: "var(--a-muted)" }}>
          Open Shipments to decide, revise, assign and progress. Events and bulk holds the manifest, tag and inward tools.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi card label="In custody" value={String(s.inCustody)} hint="picked up, not delivered" />
        <Kpi card label="Pickups next 24 h" value={String(pickupsNext24h)} hint="scheduled today, not yet picked up" />
        <Kpi card label="Flight/train/sailing bookings today" value={String(cutoffsToday)} hint="cutoff-aware pickups" />
        <Kpi card label="Open exceptions" value={String(exceptionsOpen)} hint="from the exceptions module" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="a-card">
          <H3 r="GPS 30 s · BGTS telematics (schematic, no live feed wired up)">Network now</H3>
          <div className="relative h-[200px] overflow-hidden rounded-[10px]" style={{ background: "var(--a-surface-2)" }}>
            <svg viewBox="0 0 600 240" role="img" aria-label="Schematic map of hubs and lanes" className="h-full w-full">
              <g fontFamily="var(--a-mono)" fontSize="10" fill="var(--a-fg)">
                <path d="M80,120 L300,150 L520,90" stroke="var(--a-line)" strokeWidth="2" fill="none" />
                <path d="M300,150 L420,210" stroke="var(--a-line)" strokeWidth="2" fill="none" strokeDasharray="4 3" />
                <circle cx="80" cy="120" r="9" fill="var(--a-navy)" /><text x="60" y="105">AMD hub</text>
                <circle cx="300" cy="150" r="9" fill="var(--a-navy)" /><text x="282" y="178">BRD hub</text>
                <circle cx="520" cy="90" r="9" fill="var(--a-navy)" /><text x="500" y="75">MUM hub</text>
                <circle cx="420" cy="210" r="7" fill="var(--a-muted)" /><text x="405" y="232">GOA</text>
                <circle cx="560" cy="60" r="5" fill="var(--a-ok)" /><text x="540" y="48">BOM T2 counter</text>
                {captainJobs.map((c) => (
                  <g key={c.id}>
                    <circle cx={c.x} cy={c.y} r="5" fill="var(--a-accent)" />
                    <text x={c.x - 10} y={c.y - 10}>{c.name} · {c.pcs} pcs</text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ fontFamily: "var(--a-mono)", color: "var(--a-muted)" }}>
            Hub layout is fixed reference geography, not live GPS. Orange markers are real — today&apos;s on-run captains and piece counts, from the same assignment data as Drivers — placed at a schematic point along their lane, not their live position.
          </p>
        </div>
        <div className="a-card">
          <H3 r="last 20 · from the booking event log">Event feed</H3>
          <div className="max-h-72 overflow-auto">
            {feed.length === 0 && <p className="text-sm" style={{ color: "var(--a-muted)" }}>No events yet.</p>}
            {feed.map((e, i) => (
              <div key={i} className="flex gap-2 border-b py-1.5 text-[12.5px] last:border-0" style={{ borderColor: "var(--a-line)", borderBottomStyle: "dashed" }}>
                <i className={`a-dot ${eventDot(e.text)}`} />
                <div className="min-w-0">
                  <span style={{ fontFamily: "var(--a-mono)", fontSize: 10.5, color: "var(--a-muted)" }}>
                    {new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {" · "}
                  <span style={{ fontFamily: "var(--a-mono)", fontSize: 11.5 }}>{e.bookingId}</span> — {e.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="a-card a-stripe a-stripe-warn">
          <H3>Needs a decision</H3>
          {needsDecision.length === 0 && <p className="text-sm" style={{ color: "var(--a-muted)" }}>Nothing waiting.</p>}
          <ul>
            {needsDecision.map((b) => (
              <li key={b.id} className="flex items-center justify-between border-b py-1.5 text-[12.5px] last:border-0" style={{ borderColor: "var(--a-line)", borderBottomStyle: "dashed" }}>
                <span style={{ fontFamily: "var(--a-mono)" }}>{b.id}</span>
                <span style={{ color: "var(--a-muted)" }}>{b.from} → {b.to} · {inr(b.quote.total)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="a-card a-stripe a-stripe-info">
          <H3>Copilot noticed</H3>
          {notices.length === 0 && <p className="text-sm" style={{ color: "var(--a-muted)" }}>Quiet.</p>}
          <ul>
            {notices.map((n, i) => (
              <li key={i} className="border-b py-1.5 text-[12.5px] last:border-0" style={{ borderColor: "var(--a-line)", borderBottomStyle: "dashed" }}>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10.5px]"
                  style={{ fontFamily: "var(--a-mono)", background: n.sev === "warn" ? "var(--a-warn-bg)" : "var(--a-info-bg)", color: n.sev === "warn" ? "var(--a-warn)" : "var(--a-info)" }}
                >
                  {n.sev}
                </span>{" "}
                <span style={{ color: "var(--a-muted)" }}>{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="a-card a-stripe a-stripe-ok">
          <H3>Today&apos;s numbers</H3>
          <ul className="text-[12.5px]">
            {Object.entries(LABEL).map(([status, label]) => {
              const n = all.filter((b) => b.status === status).length;
              return n > 0 ? (
                <li key={status} className="flex justify-between border-b py-1.5 last:border-0" style={{ borderColor: "var(--a-line)", borderBottomStyle: "dashed" }}>
                  <span style={{ color: "var(--a-muted)" }}>{label}</span><span className="font-semibold">{n}</span>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function eventDot(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("paid") || t.includes("delivered") || t.includes("confirmed")) return "a-dot-ok";
  if (t.includes("exception") || t.includes("reject") || t.includes("mismatch") || t.includes("blocked")) return "a-dot-bad";
  if (t.includes("quote") || t.includes("revised") || t.includes("review")) return "a-dot-warn";
  return "a-dot-info";
}

function H3({ children, r, live }: { children: React.ReactNode; r?: string; live?: boolean }) {
  return (
    <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold" style={{ fontFamily: "var(--a-display)" }}>
      {children}
      {live && <span className="a-live">live</span>}
      {r && <span className="ml-auto text-[11px] font-normal" style={{ fontFamily: "var(--a-mono)", color: "var(--a-muted)" }}>{r}</span>}
    </h3>
  );
}

function Kpi({ label, value, hint, card }: { label: string; value: string; hint?: string; card?: boolean }) {
  const body = (
    <>
      <span className="block text-[10.5px] uppercase tracking-wide" style={{ fontFamily: "var(--a-mono)", color: "var(--a-muted)" }}>{label}</span>
      <span className="block text-2xl font-extrabold" style={{ fontFamily: "var(--a-display)" }}>{value}</span>
      {hint && <span className="block text-xs" style={{ color: "var(--a-muted)" }}>{hint}</span>}
    </>
  );
  return card ? <div className="a-card">{body}</div> : <div>{body}</div>;
}
