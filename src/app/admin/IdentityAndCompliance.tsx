"use client";
/** Admin OS · Identity & compliance — ported from the static build's m-id
 *  module (admin.html:819-851, admin.js:1692-1708). Real: aggregates
 *  bookings.identity (set client-side during the booking flow by a name-
 *  similarity heuristic, NOT a government ID check — see booking.js:328-
 *  357 in the original). Be honest that "identity verification" here
 *  means a name-match score band, not DigiLocker/Aadhaar/passport — those
 *  providers are listed below as still "to wire", same as the original. */
import { useEffect, useState } from "react";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

const PROVIDERS = [
  { name: "DigiLocker", note: "Aadhaar XML pull · ₹8/check", status: "to wire" },
  { name: "Setu", note: "KYC orchestration layer", status: "to wire" },
  { name: "HyperVerge", note: "Passport / face match · ₹38/check", status: "to wire" },
  { name: "UIDAI OVSE", note: "Offline Aadhaar verification", status: "to wire" },
];

function band(score: number): { label: string; tone: "ok" | "warn" | "bad" } {
  if (score >= 0.85) return { label: "passed", tone: "ok" };
  if (score >= 0.7) return { label: "review", tone: "warn" };
  return { label: "blocked", tone: "bad" };
}

export default function IdentityAndCompliance() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);

  const withIdentity = bookings.filter((b) => b.identity);
  const passed = withIdentity.filter((b) => b.identity!.score >= 0.85).length;
  const review = withIdentity.filter((b) => b.identity!.score >= 0.7 && b.identity!.score < 0.85).length;
  const rate = withIdentity.length ? Math.round((100 * passed) / withIdentity.length) : 0;

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-3 gap-3">
        <Card><span className="block text-[11px] text-muted">Checked</span><span className="block font-display text-xl font-extrabold">{withIdentity.length}</span></Card>
        <Card><span className="block text-[11px] text-muted">Pass rate</span><span className="block font-display text-xl font-extrabold">{rate}%</span></Card>
        <Card><span className="block text-[11px] text-muted">In review band</span><span className="block font-display text-xl font-extrabold">{review}</span></Card>
      </div>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Verification ledger</h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-2 pr-2">Booking</th><th className="pr-2">Traveller</th><th className="pr-2">Method</th><th className="pr-2 text-right">Score</th><th>Result</th>
            </tr>
          </thead>
          <tbody>
            {withIdentity.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">No identity checks yet.</td></tr>}
            {withIdentity.map((b) => {
              const r = band(b.identity!.score);
              return (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                  <td className="pr-2">{b.traveller.name}</td>
                  <td className="pr-2 text-xs text-muted">{b.identity!.method}</td>
                  <td className="pr-2 text-right font-mono text-xs">{b.identity!.score.toFixed(2)}</td>
                  <td><Badge tone={r.tone}>{r.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Providers & registrations</h3>
        <ul className="space-y-1.5 text-xs">
          {PROVIDERS.map((p) => (
            <li key={p.name} className="flex items-center justify-between border-b border-dashed border-line py-1.5 last:border-0">
              <span><b>{p.name}</b> <span className="text-muted">· {p.note}</span></span>
              <Badge tone="muted">{p.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
