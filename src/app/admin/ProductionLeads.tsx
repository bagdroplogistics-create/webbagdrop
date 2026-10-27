"use client";
/** Admin OS · Production leads — read-only view onto bagdrop.co/admin's own
 *  `leads` table (joined with its linked `bookings` row), via
 *  src/app/api/admin/production-leads. This app never writes here: no
 *  accept/revise/assign actions, by design, until that's explicitly asked
 *  for. Everything shown is real data from the live production database. */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { ProductionLead } from "../api/admin/production-leads/route";

const STATUSES = ["all", "new", "contacted", "qualified", "converted", "lost"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  all: "All", new: "New", contacted: "Contacted", qualified: "Qualified", converted: "Converted", lost: "Lost",
};
const TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  new: "info", contacted: "warn", qualified: "warn", converted: "ok", lost: "bad",
};

const PAGE_SIZE = 25;

export default function ProductionLeads({ search = "" }: { search?: string }) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [page, setPage] = useState(1);
  const [leads, setLeads] = useState<ProductionLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [status, search]);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status !== "all") qs.set("status", status);
    if (search.trim()) qs.set("search", search.trim());
    fetch(`/api/admin/production-leads?${qs}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
        return j as { leads: ProductionLead[]; total: number };
      })
      .then((j) => { if (!dead) { setLeads(j.leads); setTotal(j.total); setErr(null); } })
      .catch((e) => { if (!dead) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [status, page, search]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid gap-3">
      <div className="a-card" style={{ background: "var(--a-info-bg)", border: "1px solid var(--a-info)" }}>
        <p className="text-sm" style={{ color: "var(--a-info)" }}>
          Read-only — pulled live from bagdrop.co/admin&apos;s own database. Nothing here can be edited or written back to production yet.
        </p>
      </div>

      {err && (
        <p className="a-card text-sm" style={{ background: "var(--a-bad-bg)", color: "var(--a-bad)", borderColor: "transparent" }}>
          <b>Couldn&apos;t load production leads:</b> {err}
        </p>
      )}

      <div className="a-card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold" style={{ fontFamily: "var(--a-display)" }}>
            Leads <span style={{ fontFamily: "var(--a-mono)", fontSize: 11, color: "var(--a-muted)" }}>{total} total</span>
          </h3>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition-colors cursor-pointer ${status === s ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-stone-300"}`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Lead</th><th className="pr-2">Contact</th><th className="pr-2">Route · service</th>
                <th className="pr-2">Dates</th><th className="pr-2">Booking</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!loading && leads.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted">{err ? "—" : "No leads match."}</td></tr>
              )}
              {loading && <tr><td colSpan={6} className="py-6 text-center text-muted">Loading…</td></tr>}
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-2 font-mono text-xs">{l.leadNumber ?? l.id.slice(0, 8)}</td>
                  <td className="pr-2">{l.name}<br /><span className="text-xs text-faint">{l.phone}{l.email ? ` · ${l.email}` : ""}</span></td>
                  <td className="pr-2 text-xs">{l.fromCity ?? "—"} → {l.toCity ?? "—"}<br /><span className="text-faint">{l.serviceInterest ?? "—"}</span></td>
                  <td className="pr-2 text-xs text-faint">{l.pickupDate ?? l.travelDate ?? "—"}</td>
                  <td className="pr-2 text-xs">{l.booking ? <>{l.booking.trackingId ?? "—"}<br /><span className="text-faint">{l.booking.status ?? "—"}</span></> : <span className="text-faint">—</span>}</td>
                  <td><Badge tone={TONE[l.status] ?? "muted"}>{l.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
              Prev
            </button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
