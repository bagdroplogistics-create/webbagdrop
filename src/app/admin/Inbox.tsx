"use client";
/** Admin OS · bookings inbox — the first migrated module and the pattern for
 *  the rest: typed live list, work drawer, actions appending to the event log. */
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import type { Booking, BookingStatus } from "@/lib/types";
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

export default function Inbox() {
  const [all, setAll] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: "accept" | "revise" | "reject" | null; captain: string; amount: string; reason: string }>({ kind: null, captain: "", amount: "", reason: "" });

  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setAll, (e) => setErr(e instanceof Error ? e.message : String(e))), []);

  const list = useMemo(() => all.filter((b) => filter === "all" || b.status === filter), [all, filter]);

  const booking = all.find((b) => b.id === sel) ?? null;

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
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-sm font-bold">Bookings inbox</h2>
          <Badge tone="ok">live</Badge>
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
              {list.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted">No bookings{filter !== "all" ? " in this filter" : " yet — make one on the booking page"}.</td></tr>
              )}
              {list.map((b) => (
                <tr key={b.id} onClick={() => setSel(b.id)}
                  className={`cursor-pointer border-b border-line transition-colors hover:bg-paper ${sel === b.id ? "bg-brand-soft" : ""}`}>
                  <td className="py-2.5 pr-2 font-mono text-xs">{b.id}</td>
                  <td className="pr-2">{b.traveller.name || "—"}<br /><span className="text-xs text-faint">{b.traveller.mobile}</span></td>
                  <td className="pr-2">{b.from} → {b.to}<br /><span className="text-xs text-faint">{b.ucName} · {b.date}</span></td>
                  <td className="pr-2 text-right font-mono">{b.bags}{b.oversize ? `+${b.oversize}` : ""}</td>
                  <td className="pr-2 text-right font-mono">{b.quote.breakdown.ror ? "ROR" : inr(b.quote.total)}</td>
                  <td><Badge tone={TONE[b.status]}>{LABEL[b.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="lg:sticky lg:top-20 self-start">
        {!booking ? (
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
                  <i className={`mt-1 size-1.5 shrink-0 rounded-full ${e.by === "admin" ? "bg-blue-500" : "bg-green-500"}`} />
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
