"use client";
/** Admin OS · Security & audit — team logins (Users, for people with
 *  Manage users), the department templates, and the audit trail: every
 *  change made in BAGDROP OS with the person's name (written by proxy.ts),
 *  plus booking events and CRM activity. */
import { useEffect, useMemo, useState } from "react";
import { watchAdminBookings } from "@/lib/adminApi";
import { watchCrmActivity } from "@/lib/crmApi";
import type { Booking, CrmActivity } from "@/lib/types";
import { Card } from "@/components/ui";
import { DEPARTMENTS, MODULES } from "@/lib/access";
import { useLoad } from "@/lib/useLoad";
import Users from "./Users";
import { useCan } from "./session";

interface AuditRow { at: string; text: string; by?: string }

export default function SecurityAndAudit() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => watchCrmActivity(setActivity, (e) => setErr(String(e))), []);
  const manage = useCan("act.manage_users");
  const [trail, setTrail] = useState<AuditRow[]>([]);
  useLoad(async () => { const r = await fetch("/api/admin/audit", { cache: "no-store" }); if (r.ok) setTrail(((await r.json()).entries ?? []) as AuditRow[]); });

  const rows = useMemo<AuditRow[]>(() => {
    const fromBookings: AuditRow[] = bookings.flatMap((b) =>
      b.events.filter((e) => e.by === "admin").map((e) => ({ at: e.at, text: `${b.id} · ${e.text}` }))
    );
    const fromCrm: AuditRow[] = activity.map((a) => ({ at: a.created, text: a.text }));
    return [...trail, ...fromBookings, ...fromCrm].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  }, [bookings, activity, trail]);

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      {manage && <Users />}

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Departments <span className="font-normal text-faint">starting access when you create a login — every box can be changed per person</span></h3>
        <ul className="space-y-1.5 text-xs">
          {DEPARTMENTS.filter((d) => d.key !== "custom").map((d) => {
            const edit = MODULES.filter((m) => d.perms.includes(`${m.key}.edit`)).map((m) => m.name);
            const view = MODULES.filter((m) => d.perms.includes(`${m.key}.view`) && !d.perms.includes(`${m.key}.edit`)).map((m) => m.name);
            const acts = d.perms.filter((p) => p.startsWith("act.")).length;
            return (
              <li key={d.key} className="grid gap-0.5 border-b border-dashed border-line py-1.5 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)]">
                <span className="font-medium">{d.name}</span>
                <span className="text-muted">{edit.length === MODULES.length ? "Edit everything" : edit.length ? `Edit: ${edit.join(", ")}` : ""}{view.length ? `${edit.length ? " · " : ""}View: ${view.length === MODULES.length ? "everything" : view.join(", ")}` : ""}{acts ? ` · ${acts} key action${acts === 1 ? "" : "s"}` : ""}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Audit log <span className="font-normal text-faint">who did what · sign-ins, changes in BAGDROP OS, booking events and CRM activity</span></h3>
        <div className="max-h-96 space-y-1.5 overflow-auto text-xs">
          {rows.length === 0 && <p className="text-muted">Nothing logged yet.</p>}
          {rows.map((r, i) => (
            <div key={i} className="border-b border-dashed border-line pb-1.5 last:border-0">
              <span className="text-faint">{new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> — {r.by ? <b>{r.by}: </b> : null}{r.text}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-faint">Every change made in BAGDROP OS is recorded with the person&apos;s name; booking and CRM lines come from their own history.</p>
      </Card>
    </div>
  );
}
