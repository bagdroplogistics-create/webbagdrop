"use client";
/** Customer / partner live tracking — one move on the animated map, the
 *  stage stepper and the ETA. Refreshes itself every 20 s while open. */
import { useCallback, useState } from "react";
import Link from "next/link";
import { useLoad } from "@/lib/useLoad";
import { COMPANY } from "@/lib/company";
import type { PublicTrack } from "@/lib/tracking";
import { pcsLabel } from "@/lib/opsModel";
import TrackMap from "@/components/TrackMap";

type State = { kind: "loading" } | { kind: "bad" } | { kind: "ended"; ref: string; deliveredAt: string | null } | { kind: "live"; t: PublicTrack };
const fmt = (iso: string | null, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) =>
  iso ? new Date(iso).toLocaleString("en-IN", o) : "";
const day = (d: string) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "";
const MODE = { road: "by road", air: "by air", rail: "by rail", sea: "by sea" } as const;
const WA = `https://wa.me/${COMPANY.phone.replace(/\D/g, "")}`;

function headline(t: PublicTrack): { title: string; sub: string } {
  const at = (k: string) => t.stages.find((s) => s.key === k)?.at ?? null;
  if (!at("assign")) return { title: "Your pickup is being scheduled", sub: `Pickup on ${day(t.pickupDate)}${t.slot ? `, ${t.slot}` : ""}` };
  if (!at("picked")) return { title: "Pickup scheduled", sub: `Our captain will collect your ${pcsLabel(t.pieces - t.oversize, t.oversize, "bags")} on ${day(t.pickupDate)}${t.slot ? `, ${t.slot}` : ""}` };
  if (!at("inscan")) return { title: "Picked up & sealed", sub: `On the way to our ${t.from} hub` };
  if (!at("depart")) return { title: `At our ${t.from} hub`, sub: `Every bag scanned in — departing for ${t.to} soon` };
  if (!at("arrive")) return { title: `On the way to ${t.to}`, sub: `Travelling ${MODE[t.mode]} from ${t.from}` };
  if (!at("ofd")) return { title: `Arrived in ${t.to}`, sub: "All bags scanned in — delivery is next" };
  return { title: "Out for delivery", sub: "Bags are released only against your verified identity" };
}

export default function TrackClient({ token }: { token: string }) {
  const [st, setSt] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/track?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j.ended) setSt({ kind: "ended", ref: j.ref, deliveredAt: j.deliveredAt });
      else if (j.track) setSt({ kind: "live", t: j.track });
      else if (r.status === 404) setSt({ kind: "bad" });
    } catch { /* keep what is on screen; the next poll retries */ }
  }, [token]);
  useLoad(load, 20_000);

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-display text-lg font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span></Link>
          <span className="text-xs text-muted">Live tracking</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {st.kind === "loading" && <p className="text-sm text-muted">Finding your bags…</p>}
        {st.kind === "bad" && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <h1 className="font-display text-xl font-bold">This tracking link isn&apos;t available</h1>
            <p className="mt-2 text-sm text-muted">The link may be incomplete, or the booking isn&apos;t confirmed yet. Check the latest message from Bagdrop, or <a className="font-semibold text-brand" href={WA}>WhatsApp us</a>.</p>
          </div>
        )}
        {st.kind === "ended" && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="text-3xl">✅</p>
            <h1 className="mt-2 font-display text-xl font-bold">Delivered{st.deliveredAt ? ` · ${fmt(st.deliveredAt)}` : ""}</h1>
            <p className="mt-2 text-sm text-muted">Booking {st.ref} is complete, so this tracking link has ended. Thank you for travelling light with Bagdrop.</p>
            <Link href="/account" className="mt-4 inline-block text-sm font-semibold text-brand">My bookings →</Link>
          </div>
        )}
        {st.kind === "live" && <Live t={st.t} />}
      </div>
    </main>
  );
}

function Live({ t }: { t: PublicTrack }) {
  const h = headline(t);
  const doneCount = t.stages.filter((s) => s.at).length;
  const nextIdx = t.stages.findIndex((s) => !s.at);
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-line bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.ref} · {t.from} → {t.to}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">{t.name ? `${t.name}, ` : ""}{h.title.charAt(0).toLowerCase() + h.title.slice(1)}</h1>
        <p className="mt-1 text-sm text-muted">{h.sub}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {t.eta && <span className={`rounded-full px-3 py-1 font-semibold ${t.late ? "bg-amber-100 text-amber-900" : "bg-brand-soft text-brand-dark"}`}>{t.late ? "Running a little late — " : ""}Next: {t.next} · expected {fmt(t.eta)}</span>}
          {t.position.source === "gps" && <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800">● Live location</span>}
          {t.deliveryDate && <span className="rounded-full bg-paper px-3 py-1">Delivery by {day(t.deliveryDate)}</span>}
        </div>
      </section>

      <TrackMap className="h-[340px] sm:h-[400px]" moves={[{
        id: t.ref, from: t.fromGeo, to: t.toGeo, fromName: t.from, toName: t.to, mode: t.mode,
        progress: t.progress, pos: t.position.geo, source: t.position.source, late: false,
        moving: !!t.stages.find((s) => s.key === "depart")?.at && !t.stages.find((s) => s.key === "arrive")?.at,
        label: `${t.from} → ${t.to}`,
      }]} selected={t.ref} />

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-sm font-bold">Journey <span className="font-normal text-muted">{doneCount} of {t.stages.length}</span></h2>
        <ol className="relative ml-3 border-l-2 border-line">
          {t.stages.map((s, i) => (
            <li key={s.key} className="relative pb-4 pl-5 last:pb-0">
              <span className={`absolute -left-[9px] top-0.5 grid size-4 place-items-center rounded-full text-[9px] font-bold ${s.at ? "bg-brand text-white" : i === nextIdx ? "animate-pulse bg-amber-400" : "bg-line"}`}>{s.at ? "✓" : ""}</span>
              <p className={`text-sm ${s.at || i === nextIdx ? "font-semibold" : "text-muted"}`}>{s.name}</p>
              <p className="text-xs text-muted">{s.at ? fmt(s.at) : i === nextIdx && t.eta ? `Expected ${fmt(t.eta)}` : ""}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-center text-xs text-muted">
        {pcsLabel(t.pieces - t.oversize, t.oversize, "bags")}, every one tagged and scan-tracked · this page refreshes by itself ·{" "}
        <a className="font-semibold text-brand" href={WA}>Questions? WhatsApp us</a>
      </p>
    </div>
  );
}
