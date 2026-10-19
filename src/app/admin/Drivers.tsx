"use client";
/** Admin OS · Drivers — ported from the static build's m-drv module
 *  (admin.html:475-560, admin.js:1336-1365). In the original, almost
 *  everything here was decorative (a hand-drawn SVG "map" with CSS-animated
 *  markers, no real GPS) — the only real wiring was "today's job per
 *  captain" and a push-notification preview built from the most recently
 *  assigned booking. This ports that real part and drops the fake map
 *  rather than reproducing a decoration with no data behind it. */
import { useEffect, useMemo, useState } from "react";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

const CAPTAINS = [
  { name: "Ravi K", plate: "GJ06 AB 4412", role: "Pickup & delivery" },
  { name: "Amit S", plate: "MH04 CD 9091", role: "Line-haul" },
  { name: "Sameer D", plate: "GJ06 EF 2210", role: "Pickup & delivery" },
];

export default function Drivers() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);

  const activeJobs = useMemo(
    () => bookings.filter((b) => ["assigned", "picked_up", "in_transit"].includes(b.status)),
    [bookings]
  );
  function jobFor(name: string) {
    return activeJobs.find((b) => (b.admin as Record<string, unknown>).captain === name);
  }
  const latestAssigned = useMemo(
    () => activeJobs.slice().sort((a, b) => b.created.localeCompare(a.created))[0] ?? null,
    [activeJobs]
  );

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Captains <Badge tone="ok">live</Badge></h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-2 pr-2">Captain</th><th className="pr-2">Vehicle</th><th className="pr-2">Role</th><th>Today&apos;s job</th>
            </tr>
          </thead>
          <tbody>
            {CAPTAINS.map((c) => {
              const job = jobFor(c.name);
              return (
                <tr key={c.name} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-medium">{c.name}</td>
                  <td className="pr-2 font-mono text-xs">{c.plate}</td>
                  <td className="pr-2 text-xs text-muted">{c.role}</td>
                  <td className="text-xs">{job ? <Badge tone="ok">{job.id} · {job.from} → {job.to}</Badge> : <span className="text-faint">Available</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-faint">
          No real GPS/live-map feed is wired (same as the original — its map was CSS-animated placeholder markers, not real tracking). This table is real: &quot;today&apos;s job&quot; comes from live bookings whose admin.captain matches.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Driver app push preview</h3>
        {!latestAssigned ? (
          <p className="text-sm text-muted">No active job to preview.</p>
        ) : (
          <div className="rounded-xl bg-ink p-4 text-sm text-white">
            <p className="font-semibold">New pickup assigned</p>
            <p className="mt-1 text-white/80">
              {latestAssigned.traveller.name} · {latestAssigned.pickAddr || latestAssigned.from} · {latestAssigned.bags + latestAssigned.oversize} piece(s) · {latestAssigned.ucName}
            </p>
            <p className="mt-1 text-xs text-white/50">
              Identity: {latestAssigned.identity?.ok ? `verified (${latestAssigned.identity.score.toFixed(2)})` : "not verified"} · {latestAssigned.date} {latestAssigned.ref ? `· ${latestAssigned.ref}` : ""}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
