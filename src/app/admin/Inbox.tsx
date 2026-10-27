"use client";
/** Admin OS · bookings inbox — the first migrated module and the pattern for
 *  the rest: typed live list, work drawer, actions appending to the event log.
 *
 *  Also merges in bagdrop.co/admin's real leads (src/app/api/admin/production-leads)
 *  so the whole live pipeline shows in one place, with its real status.
 *  Accept/Reject/Mark-X on a production row PATCHes bagdrop.co's own admin
 *  API (src/app/api/admin/production-leads/[id] → bagdrop-web's /api/admin/
 *  leads or /bookings), so every real side effect there — customer emails,
 *  auto-invoicing on delivery, status history, the completed-booking lock —
 *  happens exactly as it does on bagdrop.co today. Only status values this
 *  app has actually observed in production data, or that bagdrop-web's own
 *  lead→booking status-sync map uses, are offered here — never invented. */
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import type { Booking, BookingStatus } from "@/lib/types";
import type { ProductionLead } from "../api/admin/production-leads/route";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

const TONE: Record<BookingStatus, "ok" | "warn" | "bad" | "info" | "muted"> = {
  quoted: "info", identified: "info", submitted: "warn", revised: "warn",
  accepted: "ok", assigned: "ok", picked_up: "ok", in_transit: "ok",
  delivered: "ok", rejected: "bad", cancelled: "bad",
};
const LABEL: Record<BookingStatus, string> = {
  quoted: "quoted", identified: "verified", submitted: "needs decision", revised: "revised",
  accepted: "accepted", assigned: "captain assigned", picked_up: "picked up",
  in_transit: "in transit", delivered: "delivered", rejected: "rejected", cancelled: "cancelled",
};
const FILTERS = ["all", "submitted", "revised", "accepted", "rejected", "quoted"] as const;
const FILTER_LABEL: Record<(typeof FILTERS)[number], string> = {
  all: "All", submitted: "Needs decision", revised: "Revised",
  accepted: "Accepted", rejected: "Rejected", quoted: "Quoted, unpaid",
};

/** Production's two status vocabularies, mapped to this app's Badge tones —
 *  shown as-is (not translated into bagdrop-new's own status words), per
 *  "show it with its real status". */
const PROD_LEAD_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  new: "info", contacted: "warn", qualified: "warn", converted: "ok", lost: "bad",
};
const PROD_BOOKING_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  inquiry: "info", document_collection: "info", pending: "warn", review: "warn",
  accepted: "ok", quote_sent: "warn", payment_pending: "warn", payment_approved: "ok",
  confirmed: "ok", pickup_scheduled: "ok", picked_up: "ok", in_transit: "ok",
  out_for_delivery: "ok", delivered: "ok", completed: "ok", rejected: "bad", cancelled: "bad",
};

interface Row {
  key: string; source: "new" | "production";
  ref: string; name: string; mobile: string; route: string; sub: string;
  pcs: string; total: string; statusLabel: string; statusTone: "ok" | "warn" | "bad" | "info" | "muted";
  sortAt: string;
}

function bookingRow(b: Booking): Row {
  return {
    key: `new:${b.id}`, source: "new",
    ref: b.id, name: b.traveller.name || "—", mobile: b.traveller.mobile,
    route: `${b.from} → ${b.to}`, sub: `${b.ucName} · ${b.date}`,
    pcs: `${b.bags}${b.oversize ? `+${b.oversize}` : ""}`,
    total: b.quote.breakdown.ror ? "ROR" : inr(b.quote.total),
    statusLabel: LABEL[b.status], statusTone: TONE[b.status], sortAt: b.created,
  };
}
function leadRow(l: ProductionLead): Row {
  const status = l.booking?.status ?? l.status;
  const tone = (l.booking ? PROD_BOOKING_TONE[l.booking.status ?? ""] : PROD_LEAD_TONE[l.status]) ?? "muted";
  return {
    key: `prod:${l.id}`, source: "production",
    ref: l.leadNumber ?? l.id.slice(0, 8), name: l.name, mobile: l.phone,
    route: `${l.fromCity ?? "—"} → ${l.toCity ?? "—"}`, sub: `${l.serviceInterest ?? "—"} · ${l.pickupDate ?? l.travelDate ?? "—"}`,
    pcs: l.bagsCount != null ? String(l.bagsCount) : "—", total: "—",
    statusLabel: status, statusTone: tone, sortAt: l.createdAt,
  };
}

export default function Inbox({ search = "" }: { search?: string }) {
  const [all, setAll] = useState<Booking[]>([]);
  const [leads, setLeads] = useState<ProductionLead[]>([]);
  const [leadsErr, setLeadsErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [sel, setSel] = useState<{ source: "new" | "production"; id: string } | null>(null);
  const [form, setForm] = useState<{ kind: "accept" | "revise" | "reject" | null; captain: string; amount: string; reason: string }>({ kind: null, captain: "", amount: "", reason: "" });

  const [prodBusy, setProdBusy] = useState(false);
  const [prodErr, setProdErr] = useState<string | null>(null);

  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);

  async function refetchLeads() {
    const r = await fetch("/api/admin/production-leads?limit=1000");
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
    setLeads(j.leads as ProductionLead[]);
  }
  useEffect(() => { refetchLeads().catch((e) => setLeadsErr(e instanceof Error ? e.message : String(e))); }, []);

  /** Writes a status/price change to production via bagdrop-web's own admin
   *  API (see src/app/api/admin/production-leads/[id]/route.ts) and refetches. */
  async function prodAct(target: "lead" | "booking", id: string, status?: string, totalAmount?: number) {
    setProdBusy(true); setProdErr(null);
    try {
      const r = await fetch(`/api/admin/production-leads/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, status, totalAmount }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
      setForm({ kind: null, captain: "", amount: "", reason: "" });
      await refetchLeads();
    } catch (e) { setProdErr(e instanceof Error ? e.message : String(e)); }
    setProdBusy(false);
  }

  useEffect(() => { setForm({ kind: null, captain: "", amount: "", reason: "" }); }, [sel]);

  const q = search.trim().toLowerCase();
  const newBookings = useMemo(() => all.filter((b) => filter === "all" || b.status === filter), [all, filter]);

  const rows = useMemo(() => {
    const merged: Row[] = filter === "all"
      ? [...newBookings.map(bookingRow), ...leads.map(leadRow)]
      : newBookings.map(bookingRow);
    merged.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
    if (!q) return merged;
    return merged.filter((r) => [r.ref, r.name, r.mobile, r.route].some((v) => v?.toLowerCase().includes(q)));
  }, [newBookings, leads, filter, q]);

  useEffect(() => { setPage(1); }, [filter, q]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const booking = sel?.source === "new" ? all.find((b) => b.id === sel.id) ?? null : null;
  const lead = sel?.source === "production" ? leads.find((l) => l.id === sel.id) ?? null : null;

  async function act(b: Booking, patch: Partial<Booking>, event: string) {
    await adminApplyPatch(b, patch, event);
    setForm({ kind: null, captain: "", amount: "", reason: "" });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      {err && (
        <p className="lg:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
          <b>Couldn&apos;t load bookings:</b> {err}
        </p>
      )}
      {leadsErr && (
        <p className="lg:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
          <b>Couldn&apos;t load production leads:</b> {leadsErr}
        </p>
      )}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-sm font-bold">Bookings inbox</h2>
          <Badge tone="ok">live</Badge>
          <span className="text-xs text-faint">+ {leads.length} from bagdrop.co</span>
          <span className="ml-auto flex gap-1.5">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition-colors cursor-pointer ${filter === f ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-stone-300"}`}>
                {FILTER_LABEL[f]}
              </button>
            ))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Ref</th><th className="pr-2">Traveller</th><th className="pr-2">Route · date</th><th className="pr-2 text-right">Pcs</th><th className="pr-2 text-right">Total</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted">No bookings{filter !== "all" ? " in this filter" : " yet — make one on the booking page"}.</td></tr>
              )}
              {pageRows.map((r) => {
                const rowId = r.key.slice(r.key.indexOf(":") + 1);
                const isSel = !!sel && sel.source === r.source && sel.id === rowId;
                return (
                <tr key={r.key} onClick={() => setSel({ source: r.source, id: rowId })}
                  className={`cursor-pointer border-b border-line transition-colors hover:bg-paper ${isSel ? "bg-brand-soft" : ""}`}>
                  <td className="py-2.5 pr-2 font-mono text-xs">{r.ref}</td>
                  <td className="pr-2">{r.name || "—"}<br /><span className="text-xs text-faint">{r.mobile}</span></td>
                  <td className="pr-2">{r.route}<br /><span className="text-xs text-faint">{r.sub}</span></td>
                  <td className="pr-2 text-right font-mono">{r.pcs}</td>
                  <td className="pr-2 text-right font-mono">{r.total}</td>
                  <td><Badge tone={r.statusTone}>{r.statusLabel}</Badge></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{rows.length} total · page {page} of {pageCount}</span>
          <div className="flex gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
              Prev
            </button>
            <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
              Next
            </button>
          </div>
        </div>
      </Card>

      <Card className="lg:sticky lg:top-20 self-start">
        {lead ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold">{lead.leadNumber ?? lead.id.slice(0, 8)}</h3>
              <Badge tone={(lead.booking ? PROD_BOOKING_TONE[lead.booking.status ?? ""] : PROD_LEAD_TONE[lead.status]) ?? "muted"}>{lead.booking?.status ?? lead.status}</Badge>
            </div>
            <p className="mb-3 rounded-lg px-2.5 py-2 text-xs" style={{ background: "var(--a-info-bg, #e4eefa)", color: "var(--a-info, #1f5fa8)" }}>
              From bagdrop.co/admin&apos;s own database — actions below write back there for real (customer emails, invoicing included).
            </p>
            {prodErr && <p className="mb-3 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-900">{prodErr}</p>}
            {([
              ["Contact", `${lead.name} · ${lead.phone}${lead.email ? ` · ${lead.email}` : ""}`],
              ["Route", `${lead.fromCity ?? "—"} → ${lead.toCity ?? "—"}`],
              ["Service", lead.serviceInterest ?? "—"],
              ["Dates", `pickup ${lead.pickupDate ?? "—"}${lead.deliveryDate ? ` · delivery ${lead.deliveryDate}` : ""}${lead.travelDate ? ` · travel ${lead.travelDate}` : ""}`],
              ["Bags", lead.bagsCount != null ? String(lead.bagsCount) : "—"],
              ["Linked booking", lead.booking ? `${lead.booking.trackingId ?? "—"} · ${lead.booking.status ?? "—"}` : "none"],
              ["Source", lead.source ?? "—"],
              ["Assigned to", lead.assignedTo ?? "unassigned"],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
                <span className="shrink-0 text-muted">{k}</span><span className="text-right">{v}</span>
              </div>
            ))}
            {lead.notes && <p className="mt-3 text-xs text-muted">{lead.notes}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {(() => {
                const PRE_CONVERT = ["new", "contacted", "qualified"];
                const EARLY_BOOKING = ["inquiry", "document_collection", "pending", "review", "accepted", "quote_created", "quote_sent", "payment_pending", "payment_approved", "confirmed", "pickup_scheduled"];
                const bStatus = lead.booking?.status ?? null;
                if (PRE_CONVERT.includes(lead.status) && (!bStatus || EARLY_BOOKING.includes(bStatus))) {
                  return (
                    <>
                      <Button size="sm" disabled={prodBusy} onClick={() => void prodAct("lead", lead.id, "converted")}>Accept</Button>
                      {lead.booking && (
                        <Button size="sm" variant="outline" disabled={prodBusy} onClick={() => setForm((f) => ({ ...f, kind: "revise", amount: "" }))}>Revise price</Button>
                      )}
                      <Button size="sm" variant="outline" disabled={prodBusy} onClick={() => void prodAct("lead", lead.id, "lost")}>Reject</Button>
                    </>
                  );
                }
                if (!lead.booking) return null;
                const bId = lead.booking.id;
                if (bStatus && EARLY_BOOKING.includes(bStatus)) {
                  return (
                    <>
                      <Button size="sm" disabled={prodBusy} onClick={() => void prodAct("booking", bId, "picked_up")}>Mark picked up</Button>
                      <Button size="sm" variant="outline" disabled={prodBusy} onClick={() => void prodAct("booking", bId, "cancelled")}>Cancel</Button>
                    </>
                  );
                }
                if (bStatus === "picked_up") {
                  return (
                    <>
                      <Button size="sm" disabled={prodBusy} onClick={() => void prodAct("booking", bId, "in_transit")}>Mark in transit</Button>
                      <Button size="sm" variant="outline" disabled={prodBusy} onClick={() => void prodAct("booking", bId, "cancelled")}>Cancel</Button>
                    </>
                  );
                }
                if (bStatus === "in_transit") {
                  return <Button size="sm" disabled={prodBusy} onClick={() => void prodAct("booking", bId, "delivered")}>Mark delivered</Button>;
                }
                if (bStatus === "delivered") {
                  return <Button size="sm" disabled={prodBusy} onClick={() => void prodAct("booking", bId, "completed")}>Mark completed</Button>;
                }
                return null;
              })()}
            </div>

            {form.kind === "revise" && lead.booking && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label="Revised total (₹)"><Input inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
                <Button size="sm" disabled={prodBusy || !form.amount}
                  onClick={() => void prodAct("booking", lead.booking!.id, "quote_sent", Math.round(+form.amount || 0))}>
                  Send revised price
                </Button>
              </div>
            )}
          </>
        ) : !booking ? (
          <p className="text-sm text-muted">Select a booking — decide, revise, assign and progress from here. The customer&apos;s screen updates live.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold">{booking.id}</h3>
              <Badge tone={TONE[booking.status]}>{LABEL[booking.status]}</Badge>
            </div>
            {([
              ["Traveller", `${booking.traveller.name} · ${booking.traveller.mobile}`],
              ["Route", `${booking.from} → ${booking.to} · ${booking.date} · ${booking.slot || "no slot"}`],
              ["Pieces", `${booking.bags} bags${booking.oversize ? ` + ${booking.oversize} oversize` : ""}`],
              ["Quote", booking.quote.breakdown.ror ? "Rate on request" : `${inr(booking.quote.total)}${booking.quote.qid ? ` · ${booking.quote.qid}` : ""}${booking.quote.signature ? " · signed" : ""}`],
              ["Payment", booking.pay ? `${booking.pay.gateway} · ${inr(booking.pay.amount)}` : "none"],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
                <span className="shrink-0 text-muted">{k}</span><span className="text-right">{v}</span>
              </div>
            ))}

            <div className="mt-4 flex flex-wrap gap-2">
              {["submitted", "revised"].includes(booking.status) && (
                <>
                  <Button size="sm" onClick={() => setForm((f) => ({ ...f, kind: "accept" }))}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: "revise", amount: String(booking.quote.total) }))}>Revise price</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: "reject" }))}>Reject</Button>
                </>
              )}
              {booking.status === "accepted" && <Button size="sm" onClick={() => setForm((f) => ({ ...f, kind: "accept" }))}>Assign captain</Button>}
              {booking.status === "assigned" && <Button size="sm" onClick={() => void act(booking, { status: "picked_up" }, "Picked up · sealed and photographed")}>Mark picked up</Button>}
              {booking.status === "picked_up" && <Button size="sm" onClick={() => void act(booking, { status: "in_transit" }, `On the line haul to ${booking.to}`)}>Mark in transit</Button>}
              {booking.status === "in_transit" && <Button size="sm" onClick={() => void act(booking, { status: "delivered" }, "Delivered against OTP · invoice sent")}>Mark delivered</Button>}
            </div>

            {form.kind === "accept" && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label="Captain (optional)"><Input value={form.captain} onChange={(e) => setForm((f) => ({ ...f, captain: e.target.value }))} placeholder="Ravi K" /></Field>
                <Button size="sm" onClick={() => void act(booking,
                  { status: form.captain ? "assigned" : "accepted", admin: { ...booking.admin, captain: form.captain || booking.admin.captain } },
                  `Accepted by ops${form.captain ? ` · captain ${form.captain}` : ""}. LR issued.`)}>Confirm accept</Button>
              </div>
            )}
            {form.kind === "revise" && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label="Revised total (₹)"><Input inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
                <Field label="Reason shown to the customer"><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Oversize re-rated after review" /></Field>
                <Button size="sm" onClick={() => void act(booking,
                  { status: "revised", admin: { ...booking.admin, revisedTotal: Math.round(+form.amount || 0), reason: form.reason } },
                  `Price revised to ${inr(+form.amount || 0)} · ${form.reason}`)}>Send revised price</Button>
              </div>
            )}
            {form.kind === "reject" && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label="Reason shown to the customer"><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Capacity full for the chosen date" /></Field>
                <Button size="sm" onClick={() => void act(booking,
                  { status: "rejected", admin: { ...booking.admin, reason: form.reason } },
                  `Rejected · ${form.reason} · refund initiated`)}>Reject and refund</Button>
              </div>
            )}

            <h4 className="mb-1 mt-5 text-[10px] font-semibold uppercase tracking-wider text-faint">Event log</h4>
            <div className="max-h-48 space-y-1.5 overflow-auto">
              {[...booking.events].reverse().map((e, i) => (
                <p key={i} className="flex gap-2 border-b border-dashed border-line pb-1.5 text-xs last:border-0">
                  <i className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: e.by === "admin" ? "var(--a-info, #3b82f6)" : "var(--a-ok, #22c55e)" }} />
                  <span className="flex-1">{e.text}</span>
                  <time className="shrink-0 text-faint">{new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                </p>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
