"use client";
/** Admin OS · Security & audit — ported from the static build's m-sec
 *  module (admin.html:1084-1114, admin.js:2704-2717). The roles list is
 *  static prose in the original (no auth/role system lives in this file —
 *  that's the separate admin-key login, out of scope here) — kept as
 *  reference content, not re-presented as implemented. The audit log is
 *  REAL: every booking.events[] entry logged "by": "admin" plus every CRM
 *  activity-log row, merged and sorted — same as the original, with the
 *  same caveat: it's free-text event lines, not field-level before/after
 *  diffs, IP, or device — the original's caption overpromised that. */
import { useEffect, useState } from "react";
import { watchAdminBookings } from "@/lib/adminApi";
import { watchCrmActivity } from "@/lib/crmApi";
import type { Booking, CrmActivity } from "@/lib/types";
import { Card } from "@/components/ui";

const ROLES = [
  { role: "Management", access: "Full access, all modules, exports" },
  { role: "Ops lead", access: "Shipments, LR & trips, Exceptions, CRM" },
  { role: "Hub staff", access: "Shipments, LR & trips (assigned hub only)" },
  { role: "Captain", access: "Driver app only — no admin console access" },
  { role: "Sales", access: "Quotes & payments, CRM, Events & bulk" },
  { role: "Finance", access: "Finance, Pricing engine (view), Reports" },
  { role: "Partner", access: "Own bookings + API console only" },
  { role: "Auditor", access: "Read-only, Security & audit, Data & privacy" },
];

interface AuditRow { at: string; text: string }

export default function SecurityAndAudit() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => watchCrmActivity(setActivity, (e) => setErr(String(e))), []);

  const [rows, setRows] = useState<AuditRow[]>([]);
  useEffect(() => {
    const fromBookings: AuditRow[] = bookings.flatMap((b) =>
      b.events.filter((e) => e.by === "admin").map((e) => ({ at: e.at, text: `${b.id} · ${e.text}` }))
    );
    const fromCrm: AuditRow[] = activity.map((a) => ({ at: a.created, text: a.text }));
    setRows([...fromBookings, ...fromCrm].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40));
  }, [bookings, activity]);

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Roles</h3>
        <ul className="space-y-1.5 text-xs">
          {ROLES.map((r) => (
            <li key={r.role} className="flex justify-between border-b border-dashed border-line py-1.5 last:border-0">
              <span className="font-medium">{r.role}</span><span className="text-muted">{r.access}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-faint">Reference only — this app has one shared admin key, not per-role logins yet.</p>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Audit log <span className="font-normal text-faint">last 40 · real, from booking events + CRM activity</span></h3>
        <div className="max-h-96 space-y-1.5 overflow-auto text-xs">
          {rows.length === 0 && <p className="text-muted">Nothing logged yet.</p>}
          {rows.map((r, i) => (
            <div key={i} className="border-b border-dashed border-line pb-1.5 last:border-0">
              <span className="text-faint">{new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> — {r.text}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-faint">Free-text event lines only — no before/after field diffs, IP, or device captured.</p>
      </Card>
    </div>
  );
}
