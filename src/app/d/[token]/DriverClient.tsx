"use client";
/** Driver page — shares the phone's GPS for one leg while the trip is on.
 *  Fixes are sent at most every 30 s; the screen is kept awake where the
 *  browser allows it. Sharing stops on Done, or by itself once the team
 *  scans the leg's end milestone. Nothing is sent before Start trip.
 *  Below it: airline-style bag check-in (pickup) or the delivery claim
 *  check (last mile) — ./BagFlows.tsx. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { COMPANY } from "@/lib/company";
import { pcsLabel } from "@/lib/opsModel";
import { DeliveryClaim, PickupCheckIn } from "./BagFlows";

interface Job {
  ref: string; leg: string; legName: string; open: boolean; lane: string; mode: string; pieces: number; oversize: number;
  date: string; slot: string; address: string; customer: string | null; driver: string | null;
  sharing: boolean; lastFix: string | null;
}
const SEND_EVERY_MS = 30_000;

export default function DriverClient({ token }: { token: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [bad, setBad] = useState(false);
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("");
  const [sent, setSent] = useState(0);
  const watch = useRef<number | null>(null);
  const lastSent = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/track/driver?t=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (r.status === 404) { setBad(true); return; }
    const j = await r.json().catch(() => null);
    if (j?.ref) setJob(j);
  }, [token]);
  useLoad(load);

  const stopLocal = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    void wake.current?.release().catch(() => {});
    wake.current = null;
    setOn(false);
  }, []);
  useEffect(() => stopLocal, [stopLocal]);

  async function send(body: Record<string, unknown>) {
    const r = await fetch("/api/track/driver", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...body }) });
    return r.json().catch(() => ({}));
  }

  async function start() {
    if (!("geolocation" in navigator)) { setStatus("This phone's browser can't share location. Please call the Bagdrop team."); return; }
    setStatus("Asking for location permission…");
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wake.current = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch { /* screen may sleep; sharing still works while the page is open */ }
    lastSent.current = 0;
    watch.current = navigator.geolocation.watchPosition(async (p) => {
      setOn(true);
      if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
      lastSent.current = Date.now();
      const j = await send({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      if (j.stop) { stopLocal(); setStatus(j.reason === "LEG_COMPLETE" ? "This leg is complete — thank you! Sharing has stopped." : "Sharing stopped."); void load(); return; }
      if (j.error === "BAD_FIX") { setStatus("Your location looks outside India — check the phone's GPS."); return; }
      setSent((n) => n + 1);
      setStatus(`Sharing live · last sent ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
    }, (e) => {
      stopLocal();
      setStatus(e.code === e.PERMISSION_DENIED ? "Location permission was refused. Allow location for this site in the browser settings, then tap Start trip again." : "Couldn't read the location — move to open sky and try again.");
    }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 });
  }

  async function done() {
    stopLocal();
    await send({ stop: true });
    setStatus("Trip ended — sharing stopped. Thank you!");
    void load();
  }

  if (bad) return <Shell><h1 className="font-display text-xl font-bold">This driver link isn&apos;t valid</h1><p className="mt-2 text-sm text-muted">Ask the Bagdrop team to send it again.</p></Shell>;
  if (!job) return <Shell><p className="text-sm text-muted">Loading the job…</p></Shell>;

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{job.ref} · {job.legName}</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">{job.lane}</h1>
      <dl className="mt-3 grid gap-1.5 text-sm">
        <div><dt className="inline text-muted">Date · </dt><dd className="inline">{job.date}{job.slot && job.leg === "pickup" ? `, ${job.slot}` : ""}</dd></div>
        <div><dt className="inline text-muted">Pieces · </dt><dd className="inline">{pcsLabel(job.pieces - job.oversize, job.oversize)}{job.oversize > 0 && <span className="text-muted"> — XL = oversize, check the size and the matching XL tags</span>}</dd></div>
        <div><dt className="inline text-muted">{job.leg === "pickup" ? "Pickup at" : job.leg === "lastmile" ? "Deliver to" : "Run"} · </dt><dd className="inline">{job.address}</dd></div>
        {job.customer && <div><dt className="inline text-muted">Customer · </dt><dd className="inline">{job.customer}</dd></div>}
      </dl>

      {!job.open ? (
        <p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-900">This leg is complete — no need to share location. Thank you!</p>
      ) : on ? (
        <div className="mt-5 grid gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-900">
            <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-green-600" /></span>
            {status || "Sharing live"} · {sent} update(s)
          </div>
          <p className="text-xs text-muted">Keep this page open while you drive. The customer and the Bagdrop team see your position on the map.</p>
          <button onClick={done} className="cursor-pointer rounded-xl bg-ink px-4 py-3 text-base font-bold text-white">Done — stop sharing</button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <button onClick={start} className="cursor-pointer rounded-xl bg-brand px-4 py-4 text-lg font-bold text-white">▶ Start trip</button>
          <p className="text-xs text-muted">Your location is shared only for this job, only while this page is open, and stops when you tap Done.</p>
          {status && <p className="rounded-xl bg-paper p-3 text-sm">{status}</p>}
        </div>
      )}
      {job.leg === "pickup" && <div className="mt-6 border-t border-line pt-5"><PickupCheckIn token={token} /></div>}
      {job.leg === "lastmile" && <div className="mt-6 border-t border-line pt-5"><DeliveryClaim token={token} /></div>}
      <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="mt-6 block text-center text-sm font-semibold text-brand">Call Bagdrop ops · {COMPANY.phone}</a>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white px-4 py-3"><span className="font-display text-lg font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span></span> <span className="text-xs text-muted">· driver</span></header>
      <div className="mx-auto max-w-md px-4 py-6"><div className="rounded-2xl border border-line bg-white p-5">{children}</div></div>
    </main>
  );
}
