"use client";
/** Admin OS · Capacity & roster — ported from the static build's m-cap
 *  module (admin.html:632-655, admin.js:1498-1516). The forecast math is
 *  real (reuses the same forecast() Command centre uses); the roster
 *  itself is a simple fixed captain list, same as the original (no
 *  driver/captain table exists in the schema — this derives "today's job"
 *  from live bookings the same way LR & trips does). CAP (daily capacity)
 *  is a plain constant, same as the original: "5 captains × 6 pieces". */
import { useEffect, useState } from "react";
import { forecast, type Forecast } from "@/lib/intelligence";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking } from "@/lib/types";
import { Card } from "@/components/ui";

const CAPTAINS = ["Ravi K", "Amit S", "Sameer D", "Kiran P"];
const CAP_PER_CAPTAIN = 6;

export default function CapacityAndRoster() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);

  const [fc, setFc] = useState<Forecast | null>(null);
  useEffect(() => { setFc(forecast(bookings, 7)); }, [bookings]);

  const cap = CAPTAINS.length * CAP_PER_CAPTAIN;
  const activeJobs = bookings.filter((b) => ["assigned", "picked_up", "in_transit"].includes(b.status));

  function jobFor(name: string) {
    return activeJobs.find((b) => (b.admin as Record<string, unknown>).captain === name);
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <Card>
        <h3 className="mb-1 font-display text-sm font-bold">Capacity, next 7 days</h3>
        <p className="mb-3 text-xs text-muted">Daily capacity {cap} pieces ({CAPTAINS.length} captains × {CAP_PER_CAPTAIN}) · bar = booked or forecast, whichever is higher</p>
        {!fc ? (
          <p className="text-sm text-muted">Computing…</p>
        ) : (
          <div className="space-y-2">
            {fc.future.map((f) => {
              const day = f.day;
              const booked = bookings
                .filter((b) => ["accepted", "assigned", "submitted"].includes(b.status) && (b.date || "").slice(0, 10) === day)
                .reduce((a, b) => a + b.bags + b.oversize, 0);
              const pieces = Math.max(booked, Math.round(f.mu ?? 0));
              const pct = Math.min(100, Math.round((pieces / cap) * 100));
              return (
                <div key={day} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-faint">{new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                    <div
                      className={`h-full rounded-full ${pct >= 90 || pct >= 70 ? "" : "bg-brand"}`}
                      style={{ width: `${pct}%`, background: pct >= 90 ? "var(--a-bad, #ef4444)" : pct >= 70 ? "var(--a-warn, #f59e0b)" : undefined }}
                    />
                  </div>
                  <span className="w-20 text-right">{pieces} / {cap}</span>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-faint">{fc.note}</p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Roster</h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-2 pr-2">Captain</th><th className="pr-2">Status</th><th>Today</th>
            </tr>
          </thead>
          <tbody>
            {CAPTAINS.map((name) => {
              const job = jobFor(name);
              return (
                <tr key={name} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-medium">{name}</td>
                  <td className="pr-2 text-xs">{job ? "On a job" : "Available"}</td>
                  <td className="text-xs text-muted">{job ? `${job.id} · ${job.from} → ${job.to}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-faint">Roster is a fixed list (same as the original static build) — there&apos;s no captain/driver table yet; this reads &quot;today&apos;s job&quot; from bookings whose admin.captain matches the name.</p>
      </Card>
    </div>
  );
}
