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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { useOnChange } from "@/lib/stateSync";
import { CITIES, inr } from "@/lib/pricing";
import { adminApplyPatch, refreshBookings, watchAdminBookings } from "@/lib/adminApi";
import { isPaid } from "@/lib/payState";
import { deskLock } from "@/lib/deskRules";
import type { InquiryChanges } from "@/lib/inquiryEdit";
import { SERVICES as ALL_SERVICES } from "@/lib/services";
import type { Booking, BookingStatus } from "@/lib/types";
import type { ProductionLead } from "../api/admin/production-leads/route";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

/** Legacy-lead fields this screen lets staff correct — the same subset the
 *  read-only detail panel already shows, mapped server-side onto
 *  bagdrop-web's own `leads` columns (see production-leads/[id]/route.ts). */
interface LeadChanges {
  name?: string; phone?: string; email?: string; fromCity?: string; toCity?: string;
  serviceInterest?: string; travelDate?: string; pickupDate?: string; deliveryDate?: string;
  bagsCount?: number; flightNumber?: string; notes?: string; assignedTo?: string;
}

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
const DECISION_LABEL: Record<string, string> = { approved: "approved", rejected: "rejected", hold: "on hold", info: "waiting for client info" };
/** Staff can (re)decide until payment is verified or the bags move. */
const canDecide = (b: Booking) => !isPaid(b) && !b.payer && b.pay?.status !== "submitted" && ["submitted", "revised", "accepted"].includes(b.status);
/** Money is settled: verified payment, a partner's wallet/credit capture, or a host-billed event. */
const opsReady = (b: Booking) => isPaid(b) || !!b.payer;
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
/** Statuses (of the lead's linked production booking) still early enough
 *  that staff decide/progress it from here — shared by the decision
 *  buttons below and the details-edit lock. */
const EARLY_BOOKING = ["inquiry", "document_collection", "pending", "review", "accepted", "quote_created", "quote_sent", "payment_pending", "payment_approved", "confirmed", "pickup_scheduled"];
/** Why a legacy bagdrop.co lead's details can't be edited from here, or
 *  null if they can — same spirit as deskRules.ts's deskLock() for native
 *  bookings: locked once it's lost, or once its linked booking has moved
 *  past the early, still-deciding stages. */
function legacyLeadLock(l: ProductionLead): string | null {
  if (l.status === "lost") return "This lead was marked lost — it can no longer be changed here.";
  const bStatus = l.booking?.status;
  if (bStatus && !EARLY_BOOKING.includes(bStatus)) return `Its booking is ${bStatus.replace(/_/g, " ")} — it can no longer be changed here.`;
  return null;
}

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
    statusLabel: (b.admin as { instant?: { expired?: boolean } }).instant && !(b.admin as { instant?: { expired?: boolean } }).instant!.expired ? `⚡ ${LABEL[b.status]}` : LABEL[b.status],
    statusTone: TONE[b.status], sortAt: b.created,
  };
}
function leadRow(l: ProductionLead): Row {
  const status = l.booking?.status ?? l.status;
  const tone = (l.booking ? PROD_BOOKING_TONE[l.booking.status ?? ""] : PROD_LEAD_TONE[l.status]) ?? "muted";
  return {
    key: `prod:${l.id}`, source: "production",
    ref: l.leadNumber ?? l.id.slice(0, 8), name: l.name, mobile: l.phone,
    route: `${l.fromCity ?? "—"} → ${l.toCity ?? "—"}`, sub: `${l.serviceInterest ?? "—"} · ${l.pickupDate ?? l.travelDate ?? "—"}`,
    pcs: l.bagsCount != null ? String(l.bagsCount) : "—",
    total: l.booking?.totalAmount ? inr(l.booking.totalAmount) : "—",
    statusLabel: status, statusTone: tone, sortAt: l.createdAt,
  };
}

/* ---------- payment details for an approved, unpaid booking ----------
 * Prefers a Razorpay payment link (paid in one tap, confirmed automatically);
 * falls back to the UPI / bank text when the gateway isn't configured. */
function PayLinkButtons({ booking }: { booking: Booking }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function link(): Promise<string | null> {
    const r = await fetch("/api/admin/payment-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: booking.id }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return j.url as string;
    if (r.status !== 503) setMsg(j.detail ?? j.error ?? "Couldn't make the payment link.");
    return null;
  }
  async function whatsapp() {
    setMsg(null);
    const url = await link();
    const first = booking.traveller.name.split(" ")[0];
    const amount = `₹${booking.quote.total.toLocaleString("en-IN")}`;
    let text: string;
    if (url) {
      text = `Hi ${first}, Bagdrop here. Your booking ${booking.id} (${booking.from} → ${booking.to}) is approved. Please pay ${amount} securely here — UPI, card or netbanking, confirmed instantly: ${url}\nYour bookings: ${location.origin}/account`;
    } else {
      const c = (await fetch("/api/payconfig").then((r) => r.json()).catch(() => ({}))).config ?? {};
      text = `Hi ${first}, Bagdrop here. Your booking ${booking.id} (${booking.from} → ${booking.to}) is approved. Please pay ${amount}${c.upiId ? ` by UPI to ${c.upiId} (Google Pay/PhonePe/Paytm)` : ""}${c.accountNo ? ` or bank transfer to ${c.accountName ?? c.payeeName ?? "Bagdrop"} · A/c ${c.accountNo} · IFSC ${c.ifsc ?? ""}` : ""}. Pay page with QR: ${location.origin}/q/${booking.id} — then upload the screenshot in your dashboard: ${location.origin}/account`;
    }
    const msisdn = booking.traveller.mobile.replace(/\D/g, "").replace(/^(?!91)/, "91");
    window.open(`https://wa.me/${msisdn}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }
  async function copy() {
    setMsg(null);
    const url = await link();
    if (url) { await navigator.clipboard?.writeText(url); setMsg(`Payment link copied: ${url}`); }
    else if (!msg) setMsg("Online payment isn't switched on — send the UPI / bank details instead.");
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => void whatsapp()}>WhatsApp payment link →</Button>
      <Button size="sm" variant="ghost" onClick={() => void copy()}>Copy pay link</Button>
      {msg && <span className="w-full text-xs text-muted">{msg}</span>}
    </>
  );
}

export default function Inbox({ search = "" }: { search?: string }) {
  const [all, setAll] = useState<Booking[]>([]);
  const [leads, setLeads] = useState<ProductionLead[]>([]);
  const [leadsErr, setLeadsErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [sel, setSel] = useState<{ source: "new" | "production"; id: string } | null>(null);
  const [form, setForm] = useState<{ kind: "approve" | "revise" | "hold" | "info" | "reject" | "captain" | null; captain: string; amount: string; reason: string }>({ kind: null, captain: "", amount: "", reason: "" });
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<InquiryChanges | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editPriceWarn, setEditPriceWarn] = useState<string | null>(null);

  const [leadEditing, setLeadEditing] = useState(false);
  const [leadDraft, setLeadDraft] = useState<LeadChanges | null>(null);
  const [leadEditBusy, setLeadEditBusy] = useState(false);
  const [leadEditErr, setLeadEditErr] = useState<string | null>(null);
  const [leadPriceWarn, setLeadPriceWarn] = useState<string | null>(null);

  const [prodBusy, setProdBusy] = useState(false);
  const [prodErr, setProdErr] = useState<string | null>(null);
  const [prodLoaded, setProdLoaded] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);

  const refetchLeads = useCallback(async () => {
    const r = await fetch("/api/admin/production-leads?limit=1000");
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
    setLeads(j.leads as ProductionLead[]);
  }, []);
  // Both sources are fetched together, and the table waits for both before
  // showing anything — otherwise this app's own (mostly old test) bookings
  // flash alone for the second or two it takes bagdrop.co's leads to load,
  // then jump around once they join and the list re-sorts by date.
  const firstLoad = useCallback(() => refetchLeads().catch((e) => setLeadsErr(e instanceof Error ? e.message : String(e))).finally(() => setProdLoaded(true)), [refetchLeads]);
  useLoad(firstLoad);

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

  useOnChange(sel ? `${sel.source}:${sel.id}` : "", () => {
    setForm({ kind: null, captain: "", amount: "", reason: "" });
    setEditing(false); setEditDraft(null); setEditErr(null); setEditPriceWarn(null);
    setLeadEditing(false); setLeadDraft(null); setLeadEditErr(null); setLeadPriceWarn(null);
  });

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

  useOnChange(`${filter}|${q}`, () => setPage(1));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const booking = sel?.source === "new" ? all.find((b) => b.id === sel.id) ?? null : null;
  const lead = sel?.source === "production" ? leads.find((l) => l.id === sel.id) ?? null : null;

  const [busy, setBusy] = useState(false);
  /** Approve / revise / hold / needs-info / reject go through the server, which
   *  signs the price, stamps the decision history and notifies the client. */
  async function decide(b: Booking, decision: "approve" | "revise" | "hold" | "info" | "reject", note: string, total?: number) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, decision, note: note.trim(), total }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail ?? j?.error ?? `HTTP_${r.status}`);
      setForm({ kind: null, captain: "", amount: "", reason: "" });
      refreshBookings();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  async function unlockAadhaar(b: Booking) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlock", id: b.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`);
      refreshBookings();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  /** Quote-desk "save changes only" — corrects details without re-pricing or
   *  messaging the customer. If the edit would move the price, the server
   *  refuses with PRICE_WOULD_CHANGE; staff use Approve/Revise price instead,
   *  which carries the same changes to the customer. */
  function startEdit(b: Booking) {
    setEditing(true); setEditErr(null); setEditPriceWarn(null);
    setEditDraft({
      title: b.traveller.title ?? "", name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email ?? "", res: b.traveller.res,
      uc: b.uc || undefined, from: b.from, to: b.to, pickAddr: b.pickAddr, dropAddr: b.dropAddr,
      date: b.date, pickupDate: b.pickupDate ?? b.date, deliveryDate: b.deliveryDate ?? "", flightTime: b.flightTime ?? "", ref: b.ref, slot: b.slot,
      bags: b.bags, oversize: b.oversize, note: b.note,
    });
  }
  async function saveEdit(b: Booking) {
    if (!editDraft) return;
    setEditBusy(true); setEditErr(null); setEditPriceWarn(null);
    try {
      const r = await fetch("/api/admin/inquiry", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, changes: editDraft, rev: b.rev ?? 0 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === "PRICE_WOULD_CHANGE") { setEditPriceWarn(j.detail as string); return; }
        throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
      }
      setEditing(false); setEditDraft(null);
      refreshBookings();
    } catch (e) { setEditErr(e instanceof Error ? e.message : String(e)); }
    setEditBusy(false);
  }

  /** Same "correct it without re-pricing or messaging" pattern, for a lead
   *  synced in from bagdrop.co's own database — PATCHes the real row there
   *  via /api/admin/production-leads/[id] (src/app/api/admin/production-leads/
   *  [id]/route.ts), which refuses a route/bag-count change that would move
   *  an already-quoted price (PRICE_WOULD_CHANGE), same as the native edit. */
  function startLeadEdit(l: ProductionLead) {
    setLeadEditing(true); setLeadEditErr(null); setLeadPriceWarn(null);
    setLeadDraft({
      name: l.name, phone: l.phone, email: l.email ?? "", fromCity: l.fromCity ?? "", toCity: l.toCity ?? "",
      serviceInterest: l.serviceInterest ?? "", travelDate: l.travelDate ?? "", pickupDate: l.pickupDate ?? "",
      deliveryDate: l.deliveryDate ?? "", bagsCount: l.bagsCount ?? 0, flightNumber: l.flightNumber ?? "",
      notes: l.notes ?? "", assignedTo: l.assignedTo ?? "",
    });
  }
  async function saveLeadEdit(l: ProductionLead) {
    if (!leadDraft) return;
    setLeadEditBusy(true); setLeadEditErr(null); setLeadPriceWarn(null);
    try {
      const r = await fetch(`/api/admin/production-leads/${l.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "lead", fields: leadDraft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === "PRICE_WOULD_CHANGE") { setLeadPriceWarn(j.detail as string); return; }
        throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
      }
      setLeadEditing(false); setLeadDraft(null);
      await refetchLeads();
    } catch (e) { setLeadEditErr(e instanceof Error ? e.message : String(e)); }
    setLeadEditBusy(false);
  }

  async function act(b: Booking, patch: Partial<Booking>, event: string) {
    try {
      await adminApplyPatch(b, patch, event);
      setForm({ kind: null, captain: "", amount: "", reason: "" });
    } catch (e) {
      // e.g. the identity gate: pickup refused until Aadhaar UIDAI is verified
      setErr(e instanceof Error ? e.message : String(e));
    }
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
              {!prodLoaded && (
                <tr><td colSpan={6} className="py-6 text-center text-muted">Loading…</td></tr>
              )}
              {prodLoaded && pageRows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted">No bookings{filter !== "all" ? " in this filter" : " yet — make one on the booking page"}.</td></tr>
              )}
              {prodLoaded && pageRows.map((r) => {
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
              <span className="flex items-center gap-2">
                <Badge tone={(lead.booking ? PROD_BOOKING_TONE[lead.booking.status ?? ""] : PROD_LEAD_TONE[lead.status]) ?? "muted"}>{lead.booking?.status ?? lead.status}</Badge>
                {!leadEditing && !legacyLeadLock(lead) && <Button size="sm" variant="ghost" onClick={() => startLeadEdit(lead)}>Edit</Button>}
              </span>
            </div>
            <p className="mb-3 rounded-lg px-2.5 py-2 text-xs" style={{ background: "var(--a-info-bg, #e4eefa)", color: "var(--a-info, #1f5fa8)" }}>
              From bagdrop.co/admin&apos;s own database — actions below write back there for real (customer emails, invoicing included).
            </p>
            {prodErr && <p className="mb-3 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-900">{prodErr}</p>}
            {leadEditing && leadDraft ? (
              <EditLeadForm draft={leadDraft} setDraft={setLeadDraft} busy={leadEditBusy} err={leadEditErr} priceWarn={leadPriceWarn}
                onCancel={() => { setLeadEditing(false); setLeadDraft(null); setLeadEditErr(null); setLeadPriceWarn(null); }}
                onSave={() => void saveLeadEdit(lead)} />
            ) : (
              <>
                {([
                  ["Contact", `${lead.name} · ${lead.phone}${lead.email ? ` · ${lead.email}` : ""}`],
                  ["Route", `${lead.fromCity ?? "—"} → ${lead.toCity ?? "—"}`],
                  ["Service", lead.serviceInterest ?? "—"],
                  ["Dates", `pickup ${lead.pickupDate ?? "—"}${lead.deliveryDate ? ` · delivery ${lead.deliveryDate}` : ""}${lead.travelDate ? ` · travel ${lead.travelDate}` : ""}`],
                  ["Bags", lead.bagsCount != null ? String(lead.bagsCount) : "—"],
                  ["Quote", lead.booking?.totalAmount ? inr(lead.booking.totalAmount) : "—"],
                  ["Linked booking", lead.booking ? `${lead.booking.trackingId ?? "—"} · ${lead.booking.status ?? "—"}` : "none"],
                  ["Source", lead.source ?? "—"],
                  ["Assigned to", lead.assignedTo ?? "unassigned"],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
                    <span className="shrink-0 text-muted">{k}</span><span className="text-right">{v}</span>
                  </div>
                ))}
                {lead.notes && <p className="mt-3 text-xs text-muted">{lead.notes}</p>}
              </>
            )}

            {!leadEditing && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(() => {
                const PRE_CONVERT = ["new", "contacted", "qualified"];
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
            )}

            {!leadEditing && form.kind === "revise" && lead.booking && (
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
              <span className="flex items-center gap-2">
                <Badge tone={TONE[booking.status]}>{LABEL[booking.status]}</Badge>
                {!editing && !deskLock(booking) && <Button size="sm" variant="ghost" onClick={() => startEdit(booking)}>Edit</Button>}
              </span>
            </div>
            {editing && deskLock(booking) && <p className="mb-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">{deskLock(booking)}</p>}
            {editing && editDraft && !deskLock(booking) ? (
              <EditInquiryForm draft={editDraft} setDraft={setEditDraft} busy={editBusy} err={editErr} priceWarn={editPriceWarn}
                onCancel={() => { setEditing(false); setEditDraft(null); setEditErr(null); setEditPriceWarn(null); }}
                onSave={() => void saveEdit(booking)} />
            ) : (
              <>
                {([
                  ["Traveller", `${booking.traveller.name} · ${booking.traveller.mobile}`],
                  ["Route", `${booking.from} → ${booking.to} · ${booking.date} · ${booking.slot || "no slot"}`],
                  ["Pieces", `${booking.bags} bags${booking.oversize ? ` + ${booking.oversize} oversize` : ""}`],
                  ["Quote", booking.quote.breakdown.ror ? "Rate on request" : `${inr(booking.quote.total)}${booking.quote.qid ? ` · ${booking.quote.qid}` : ""}${booking.quote.signature ? " · signed" : ""}`],
                  ["Payment", booking.pay ? `${booking.pay.status === "captured" ? "✓ verified" : booking.pay.status === "submitted" ? "⏳ proof sent — verify in Finance" : booking.pay.status} · ${booking.pay.gateway} · ${inr(booking.pay.amount)}` : "none"],
                  ["Identity", booking.identity?.ok ? `✓ verified · ${booking.identity.method}` : "⚠ Aadhaar pending — pickup locked"],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
                    <span className="shrink-0 text-muted">{k}</span><span className="text-right">{v}</span>
                  </div>
                ))}
              </>
            )}
            {!booking.identity?.ok && (
              <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
                Client verifies at <button className="font-mono font-semibold underline" onClick={() => void navigator.clipboard?.writeText(`${location.origin}/verify/${booking.id}`)}>/verify/{booking.id}</button> (click to copy) — the link also went out on WhatsApp + email automatically.
              </p>
            )}

            {(() => {
              const d = booking.admin.decision as { state?: string; note?: string } | undefined;
              return d?.state && d.state !== "pending" ? (
                <p className={`mt-2 rounded-xl p-2.5 text-xs ${d.state === "approved" ? "bg-green-50 text-green-900" : d.state === "rejected" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
                  <b>Decision: {DECISION_LABEL[d.state] ?? d.state}</b>{d.note ? ` · ${d.note}` : ""}
                </p>
              ) : null;
            })()}
            {booking.admin.aadhaarLocked === true && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900">
                <span><b>Aadhaar locked</b> after 3 wrong codes. Speak to the client, then unlock.</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void unlockAadhaar(booking)}>Unlock</Button>
              </div>
            )}

            {!editing && (
            <div className="mt-4 flex flex-wrap gap-2">
              {canDecide(booking) && (
                <>
                  <Button size="sm" onClick={() => setForm((f) => ({ ...f, kind: "approve", amount: booking.quote.breakdown.ror ? "" : String(booking.quote.total), reason: "" }))}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: "revise", amount: booking.quote.breakdown.ror ? "" : String(booking.quote.total), reason: "" }))}>Revise price</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: "hold", reason: "" }))}>On hold</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: "info", reason: "" }))}>Needs info</Button>
                  <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, kind: "reject", reason: "" }))}>Reject</Button>
                </>
              )}
              {["submitted", "revised"].includes(booking.status) && opsReady(booking) && <Button size="sm" onClick={() => setForm((f) => ({ ...f, kind: "captain" }))}>Confirm booking</Button>}
              {booking.status === "accepted" && opsReady(booking) && <Button size="sm" onClick={() => setForm((f) => ({ ...f, kind: "captain" }))}>Assign captain</Button>}
              {booking.status === "accepted" && !opsReady(booking) && <span className="self-center text-xs text-muted">Approved · waiting for the client&apos;s payment to be verified in Finance before a captain is assigned.</span>}
              {booking.status === "accepted" && !opsReady(booking) && booking.pay?.status !== "submitted" && booking.quote.total > 0 && <PayLinkButtons booking={booking} />}
              {booking.status === "assigned" && <Button size="sm" onClick={() => void act(booking, { status: "picked_up" }, "Picked up · sealed and photographed")}>Mark picked up</Button>}
              {booking.status === "picked_up" && <Button size="sm" onClick={() => void act(booking, { status: "in_transit" }, `On the line haul to ${booking.to}`)}>Mark in transit</Button>}
              {booking.status === "in_transit" && <Button size="sm" onClick={() => void act(booking, { status: "delivered" }, "Delivered against OTP · invoice sent")}>Mark delivered</Button>}
            </div>
            )}

            {!editing && form.kind === "captain" && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label={booking.status === "accepted" ? "Captain" : "Captain (optional)"}><Input value={form.captain} onChange={(e) => setForm((f) => ({ ...f, captain: e.target.value }))} placeholder="Ravi K" /></Field>
                <Button size="sm" disabled={booking.status === "accepted" && !form.captain.trim()} onClick={() => void act(booking,
                  { status: form.captain.trim() ? "assigned" : "accepted", admin: { ...booking.admin, captain: form.captain.trim() || booking.admin.captain } },
                  form.captain.trim() ? `Confirmed by ops · captain ${form.captain.trim()} assigned` : "Confirmed by ops")}>{booking.status === "accepted" ? "Assign" : "Confirm"}</Button>
              </div>
            )}
            {!editing && (form.kind === "approve" || form.kind === "revise") && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label={form.kind === "approve"
                  ? (booking.quote.breakdown.ror ? "Amount to approve at (₹, incl. 5% GST) — required for a new sector" : "Amount (₹, incl. 5% GST) — change only to override the chart price")
                  : "Revised total (₹, incl. 5% GST)"}>
                  <Input inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d]/g, "") }))} />
                </Field>
                <Field label="Note to the client (optional)"><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder={form.kind === "approve" ? "Pickup window confirmed" : "Oversize re-rated after review"} /></Field>
                <Button size="sm" disabled={busy || (form.kind === "revise" && !(+form.amount > 0)) || (form.kind === "approve" && !!booking.quote.breakdown.ror && !(+form.amount > 0))}
                  onClick={() => void decide(booking, form.kind as "approve" | "revise",
                    form.reason, form.kind === "approve" && +form.amount === booking.quote.total && !booking.quote.breakdown.ror ? undefined : +form.amount || undefined)}>
                  {form.kind === "approve" ? "Approve and send payment details" : "Send revised price"}
                </Button>
              </div>
            )}
            {!editing && (form.kind === "hold" || form.kind === "info" || form.kind === "reject") && (
              <div className="mt-3 rounded-xl bg-paper p-3">
                <Field label={form.kind === "info" ? "Question for the client" : "Reason shown to the client"}>
                  <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder={form.kind === "hold" ? "Checking truck capacity for that date" : form.kind === "info" ? "Please share the exact flat number and lift access" : "No capacity on the chosen date"} />
                </Field>
                <Button size="sm" disabled={busy || !form.reason.trim()} onClick={() => void decide(booking, form.kind as "hold" | "info" | "reject", form.reason)}>
                  {form.kind === "hold" ? "Put on hold" : form.kind === "info" ? "Ask the client" : "Reject booking"}
                </Button>
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

/* ================= quote-desk inquiry edit ================= */
/** Correct an inquiry's details without re-pricing or messaging the customer
 *  (src/lib/inquiryEdit.ts, PATCH /api/admin/inquiry). A route or bag change
 *  that would move the price is refused by the server — staff use Approve /
 *  Revise price instead, which carries the same edit to the customer. */
function EditInquiryForm({ draft, setDraft, busy, err, priceWarn, onCancel, onSave }: {
  draft: InquiryChanges; setDraft: (d: InquiryChanges) => void;
  busy: boolean; err: string | null; priceWarn: string | null;
  onCancel: () => void; onSave: () => void;
}) {
  const set = <K extends keyof InquiryChanges>(k: K, v: InquiryChanges[K]) => setDraft({ ...draft, [k]: v });
  return (
    <div className="mb-3 rounded-xl bg-paper p-3">
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Title"><Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Mr." /></Field>
        <Field label="Name"><Input value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Mobile"><Input value={draft.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} /></Field>
        <Field label="Email"><Input value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
        <Field label="Traveller is">
          <Select value={draft.res ?? "in"} onChange={(e) => set("res", e.target.value as InquiryChanges["res"])}>
            <option value="in">Indian resident</option>
            <option value="intl">International</option>
          </Select>
        </Field>
        <Field label="Service">
          <Select value={draft.uc ?? ""} onChange={(e) => set("uc", e.target.value)}>
            {ALL_SERVICES.map((s) => <option key={s.uc} value={s.uc}>{s.title}</option>)}
          </Select>
        </Field>
        <Field label="Pickup city">
          <Select value={draft.from ?? ""} onChange={(e) => set("from", e.target.value)}>
            {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Delivery city">
          <Select value={draft.to ?? ""} onChange={(e) => set("to", e.target.value)}>
            {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Pickup address"><Input value={draft.pickAddr ?? ""} onChange={(e) => set("pickAddr", e.target.value)} /></Field>
        <Field label="Delivery address"><Input value={draft.dropAddr ?? ""} onChange={(e) => set("dropAddr", e.target.value)} /></Field>
        <Field label="Travel date"><Input type="date" value={draft.date ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Pickup date"><Input type="date" value={draft.pickupDate ?? ""} onChange={(e) => set("pickupDate", e.target.value)} /></Field>
        <Field label="Delivery date"><Input type="date" value={draft.deliveryDate ?? ""} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
        <Field label="Flight time"><Input type="time" value={draft.flightTime ?? ""} onChange={(e) => set("flightTime", e.target.value)} /></Field>
        <Field label="Flight / reference"><Input value={draft.ref ?? ""} onChange={(e) => set("ref", e.target.value)} /></Field>
        <Field label="Pickup time / slot"><Input value={draft.slot ?? ""} onChange={(e) => set("slot", e.target.value)} /></Field>
        <Field label="Bags"><Input type="number" min={0} value={draft.bags ?? 0} onChange={(e) => set("bags", Number(e.target.value))} /></Field>
        <Field label="Oversize"><Input type="number" min={0} value={draft.oversize ?? 0} onChange={(e) => set("oversize", Number(e.target.value))} /></Field>
      </div>
      <Field label="Customer note"><Input value={draft.note ?? ""} onChange={(e) => set("note", e.target.value)} /></Field>
      {priceWarn && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          {priceWarn}
        </p>
      )}
      {err && <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-900">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save changes"}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/* ================= legacy bagdrop.co lead edit ================= */
/** Same "correct it, don't silently re-price or message the customer"
 *  pattern as EditInquiryForm above, for a lead synced in from bagdrop.co's
 *  own database (PATCH /api/admin/production-leads/[id]). A route or
 *  bag-count change on an already-quoted lead is refused by the server —
 *  staff use "Revise price" instead, which does message the customer. */
function EditLeadForm({ draft, setDraft, busy, err, priceWarn, onCancel, onSave }: {
  draft: LeadChanges; setDraft: (d: LeadChanges) => void;
  busy: boolean; err: string | null; priceWarn: string | null;
  onCancel: () => void; onSave: () => void;
}) {
  const set = <K extends keyof LeadChanges>(k: K, v: LeadChanges[K]) => setDraft({ ...draft, [k]: v });
  return (
    <div className="mb-3 rounded-xl bg-paper p-3">
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Name"><Input value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Phone"><Input value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
        <Field label="Service"><Input value={draft.serviceInterest ?? ""} onChange={(e) => set("serviceInterest", e.target.value)} /></Field>
        <Field label="From city"><Input value={draft.fromCity ?? ""} onChange={(e) => set("fromCity", e.target.value)} /></Field>
        <Field label="To city"><Input value={draft.toCity ?? ""} onChange={(e) => set("toCity", e.target.value)} /></Field>
        <Field label="Travel date"><Input type="date" value={draft.travelDate ?? ""} onChange={(e) => set("travelDate", e.target.value)} /></Field>
        <Field label="Pickup date"><Input type="date" value={draft.pickupDate ?? ""} onChange={(e) => set("pickupDate", e.target.value)} /></Field>
        <Field label="Delivery date"><Input type="date" value={draft.deliveryDate ?? ""} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
        <Field label="Bags"><Input type="number" min={0} value={draft.bagsCount ?? 0} onChange={(e) => set("bagsCount", Number(e.target.value))} /></Field>
        <Field label="Flight / reference"><Input value={draft.flightNumber ?? ""} onChange={(e) => set("flightNumber", e.target.value)} /></Field>
        <Field label="Assigned to"><Input value={draft.assignedTo ?? ""} onChange={(e) => set("assignedTo", e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Input value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      {priceWarn && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          {priceWarn}
        </p>
      )}
      {err && <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-900">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save changes"}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
