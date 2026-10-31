"use client";
/** BAGDROP OS · Live tracking — every confirmed move that isn't delivered
 *  yet, on an animated map (components/TrackMap.tsx) with a list beside it.
 *  Stage, ETA, lateness and estimated position come from the milestones
 *  scanned in Operations (src/lib/tracking.ts); a driver's phone GPS, when
 *  sharing, replaces the estimate. Ops types the ETA for each next step
 *  here; the customer's link and each leg's driver link can be copied or
 *  sent from the move panel. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { watchAdminBookings, refreshBookings } from "@/lib/adminApi";
import { isTrackable, trackState, LEG_NAME, type GpsPoint, type TrackLeg, type TrackState } from "@/lib/tracking";
import { MILESTONES, pcsLabel } from "@/lib/opsModel";
import type { Booking } from "@/lib/types";
import TrackMap, { type MapMove } from "@/components/TrackMap";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

interface MoveExtras {
  trackUrl: string;
  driverLinks: Partial<Record<TrackLeg, { url: string; assignee: string; mobile?: string }>>;
  gps: { points: GpsPoint[]; sharing: { leg: TrackLeg; since: string } | null } | null;
}
type Group = "all" | "pickup" | "linehaul" | "lastmile" | "late";
const STAGE_LABEL: Record<TrackLeg, string> = { pickup: "At pickup", linehaul: "Line-haul", lastmile: "Last mile" };
const MODE_ICON = { road: "🚚", air: "✈️", rail: "🚆", sea: "⛴" } as const;
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const ago = (iso: string, now: number) => { const m = Math.round((now - Date.parse(iso)) / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const wa = (m: string | undefined, t: string) => `https://wa.me/${(m ?? "").replace(/\D/g, "").replace(/^(?!91)/, "91")}?text=${encodeURIComponent(t)}`;

/** A clock that ticks every few seconds so estimated markers keep gliding. */
function useTick(ms: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    const first = setTimeout(() => setNow(Date.now()), 0);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [ms]);
  return now;
}

function mapMoveOf(s: TrackState, extras?: { gps?: MoveExtras["gps"]; label?: string }): MapMove {
  const trail = (extras?.gps?.points ?? []).filter((p) => p.leg === s.leg).slice(-30).map((p) => ({ lat: p.lat, lng: p.lng }));
  return {
    id: s.id, from: s.fromGeo, to: s.toGeo, fromName: s.from, toName: s.to, mode: s.mode,
    progress: s.progress, pos: s.position.geo, source: s.position.source, late: s.late,
    moving: s.leg === "linehaul" && s.done.some((d) => d.key === "depart"),
    label: extras?.label ?? `${s.id} · ${s.from} → ${s.to}`,
    trail: s.position.source === "gps" ? trail : [],
  };
}

export default function LiveTracking() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [extras, setExtras] = useState<Record<string, MoveExtras>>({});
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("all");
  const [mode, setMode] = useState("");
  const [q, setQ] = useState("");
  const now = useTick(5_000);

  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  const loadExtras = useCallback(async () => {
    const r = await fetch("/api/admin/tracking", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) setErr(j.error ?? `HTTP_${r.status}`); else { setExtras(j.moves ?? {}); setErr(null); }
  }, []);
  useLoad(loadExtras, 15_000);

  const live = useMemo(() => {
    if (!now) return [];
    return bookings.filter((b) => isTrackable(b) && b.status !== "delivered").map((b) => {
      const g = extras[b.id]?.gps;
      const fix = g?.points?.[g.points.length - 1] ?? null;
      return { b, s: trackState(b, now, fix) };
    }).filter(({ s }) => !s.delivered);
  }, [bookings, extras, now]);

  const shown = live.filter(({ b, s }) =>
    (group === "all" || (group === "late" ? s.late : s.leg === group)) &&
    (!mode || s.mode === mode) &&
    (!q || `${b.id} ${b.traveller.name} ${b.from} ${b.to}`.toLowerCase().includes(q.toLowerCase())));
  const count = (g: Group) => live.filter(({ s }) => (g === "all" ? true : g === "late" ? s.late : s.leg === g)).length;
  const gpsLive = live.filter(({ s }) => s.position.source === "gps").length;
  const selected = live.find(({ b }) => b.id === sel) ?? null;

  const moves = shown.map(({ b, s }) => mapMoveOf(s, {
    gps: extras[b.id]?.gps,
    label: `${b.id} · ${b.traveller.name} · ${b.from} → ${b.to} · ${s.next?.name ?? "delivered"}${s.eta ? ` · ETA ${fmt(s.eta)}` : ""}${s.late ? " · LATE" : ""}${s.position.source === "gps" ? " · live GPS" : ""}`,
  }));

  return (
    <div className="grid gap-4">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Live tracking:</b> {err}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([["all", "Moves live"], ["pickup", "At pickup"], ["linehaul", "Line-haul"], ["lastmile", "Last mile"], ["late", "Late"]] as const).map(([g, n]) => (
          <button key={g} onClick={() => setGroup(g)}
            className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${group === g ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-paper"}`}>
            <span className={`block text-[11px] ${group === g ? "text-white/70" : "text-muted"}`}>{n}</span>
            <span className={`font-display text-2xl font-extrabold ${g === "late" && count(g) > 0 && group !== g ? "text-red-600" : ""}`}>{count(g)}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Input className="w-56! py-1.5! text-xs!" placeholder="Search booking, name, city" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select className="w-32! py-1.5! text-xs!" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
              <option value="">All modes</option><option value="road">🚚 Road</option><option value="air">✈️ Air</option><option value="rail">🚆 Rail</option>
            </Select>
            <span className="text-muted">{gpsLive} on live GPS · map refreshes every 15 s</span>
          </div>
          <TrackMap moves={moves} selected={sel} onSelect={setSel} className="h-[520px]" />
          {selected && <MovePanel key={selected.b.id} b={selected.b} s={selected.s} x={extras[selected.b.id]} now={now ?? 0} onSaved={() => { refreshBookings(); void loadExtras(); }} />}
        </div>

        <Card className="p-3">
          <h3 className="mb-2 font-display text-sm font-bold">Moves <span className="font-normal text-faint">{shown.length}</span></h3>
          {shown.length === 0 && <p className="py-8 text-center text-sm text-muted">{live.length ? "Nothing matches these filters." : "No confirmed moves in progress right now."}</p>}
          <div className="max-h-[640px] space-y-1.5 overflow-auto">
            {shown.sort((a, z) => Number(z.s.late) - Number(a.s.late) || a.s.stageIndex - z.s.stageIndex).map(({ b, s }) => (
              <button key={b.id} onClick={() => setSel(b.id === sel ? null : b.id)}
                className={`w-full cursor-pointer rounded-lg border p-2 text-left text-xs transition-colors hover:bg-paper ${sel === b.id ? "border-ink bg-paper" : s.late ? "border-red-300" : "border-line"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold">{MODE_ICON[s.mode]} {b.id}</span>
                  <span className="flex gap-1">
                    {s.position.source === "gps" && <Badge tone="ok">live GPS</Badge>}
                    {s.late ? <Badge tone="bad">late {s.lateByMin >= 60 ? `${Math.round(s.lateByMin / 60)} h` : `${s.lateByMin} min`}</Badge> : s.leg && <Badge tone="info">{STAGE_LABEL[s.leg]}</Badge>}
                  </span>
                </span>
                <span className="mt-0.5 block text-muted">{b.traveller.name} · {b.from} → {b.to} · {pcsLabel(b.bags, b.oversize)}</span>
                <span className="mt-1 flex items-center gap-1">
                  {MILESTONES.map((m, i) => <span key={m.key} className={`h-1 flex-1 rounded-full ${i < s.stageIndex ? (s.late ? "bg-red-400" : "bg-brand") : "bg-paper"}`} />)}
                </span>
                <span className="mt-1 block text-[11px]">Next: <b>{s.next?.name ?? "—"}</b>{s.eta ? ` · ETA ${fmt(s.eta)}` : " · ETA not set"}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MovePanel({ b, s, x, now, onSaved }: { b: Booking; s: TrackState; x?: MoveExtras; now: number; onSaved: () => void }) {
  const [eta, setEta] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fix = x?.gps?.points?.[x.gps.points.length - 1] ?? null;

  async function save(clear = false) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/tracking", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { action: "clearEta", id: b.id } : { action: "eta", id: b.id, at: new Date(eta).toISOString(), note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
      setMsg({ ok: true, text: clear ? "ETA cleared." : `ETA for "${s.next?.name}" saved.` });
      setEta(""); setNote(""); onSaved();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => setMsg({ ok: true, text: `${what} copied.` }));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold">{MODE_ICON[s.mode]} {b.id} · {b.traveller.name}</h3>
          <p className="text-xs text-muted">{b.from} → {b.to} · {pcsLabel(b.bags, b.oversize)} · pickup {(b.pickupDate || b.date).slice(0, 10)} {b.slot}{b.deliveryDate ? ` · deliver by ${b.deliveryDate}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {x?.trackUrl && <Button size="sm" variant="outline" onClick={() => copy(origin + x.trackUrl, "Customer tracking link")}>Copy tracking link</Button>}
          {x?.trackUrl && <a href={x.trackUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Open ↗</Button></a>}
        </div>
      </div>

      {/* stage stepper */}
      <ol className="mt-4 grid grid-cols-4 gap-y-3 md:grid-cols-8">
        {MILESTONES.map((m, i) => {
          const d = s.done.find((x) => x.key === m.key);
          const isNext = s.next?.key === m.key;
          return (
            <li key={m.key} className="relative pr-2 text-[11px]">
              <span className={`mb-1 grid size-6 place-items-center rounded-full text-[10px] font-bold ${d ? "bg-brand text-white" : isNext ? (s.late ? "animate-pulse bg-red-500 text-white" : "animate-pulse bg-amber-400 text-ink") : "bg-paper text-muted"}`}>{d ? "✓" : i + 1}</span>
              <span className={`block leading-tight ${d || isNext ? "font-semibold" : "text-muted"}`}>{m.name}</span>
              <span className="block text-faint">{d ? fmt(d.at) : isNext && s.eta ? `ETA ${fmt(s.eta)}` : ""}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-paper p-3">
          <p className="text-xs font-semibold">ETA for the next step · {s.next?.name ?? "—"}</p>
          <p className="mb-2 text-[11px] text-muted">{s.eta ? `Now ${fmt(s.eta)}${s.late ? ` — ${s.lateByMin} min past` : ""}.` : "Not set — the map holds the move at its last scan until an ETA is typed."}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Date & time"><Input type="datetime-local" className="py-1.5! text-xs!" value={eta} onChange={(e) => setEta(e.target.value)} /></Field>
            <Field label="Note (optional)"><Input className="w-40! py-1.5! text-xs!" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. traffic at Vapi" /></Field>
            <Button size="sm" disabled={busy || !eta} onClick={() => save()}>Save ETA</Button>
            {s.eta && <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(true)}>Clear</Button>}
          </div>
          <p className="mt-2 text-[11px] text-muted">Milestones are scanned in Operations → Shipments; the map and the customer&apos;s link update from those scans.</p>
        </div>

        <div className="rounded-xl bg-paper p-3 text-xs">
          <p className="font-semibold">Position</p>
          <p className="mb-2 text-[11px] text-muted">
            {s.position.source === "gps" ? `Live GPS from the ${LEG_NAME[fix!.leg].toLowerCase()} driver · ${ago(fix!.at, now)}${fix?.acc ? ` · ±${fix.acc} m` : ""}`
              : fix ? `Estimated — last GPS fix ${ago(fix.at, now)} (${LEG_NAME[fix.leg].toLowerCase()} leg)` : "Estimated from the last scan — no driver GPS yet."}
          </p>
          <p className="font-semibold">Driver links</p>
          {(["pickup", "linehaul", "lastmile"] as TrackLeg[]).map((leg) => {
            const d = x?.driverLinks?.[leg];
            return (
              <div key={leg} className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
                <span>{LEG_NAME[leg]} · {d ? <b>{d.assignee}</b> : <span className="text-muted">not assigned</span>}{x?.gps?.sharing?.leg === leg && <span className="ml-1 text-green-700">● sharing</span>}</span>
                {d && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => copy(origin + d.url, `${LEG_NAME[leg]} driver link`)}>Copy</Button>
                    {d.mobile && <a href={wa(d.mobile, `Bagdrop job ${b.id} · ${LEG_NAME[leg]}. Open and tap Start trip: ${origin}${d.url}`)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">WhatsApp</Button></a>}
                  </span>
                )}
              </div>
            );
          })}
          <p className="mt-2 text-[11px] text-muted">Drivers with a mobile on file get their link automatically when assigned.</p>
        </div>
      </div>
      {msg && <p className={`mt-3 rounded-lg p-2 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
    </Card>
  );
}
