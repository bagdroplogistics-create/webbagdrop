"use client";
/** "Where is it, what's next" — the same five-phase ladder on every booking
 *  in every module (rules: src/lib/journey.ts). Cancel and Restore live
 *  here too, so a booking cancelled by mistake is one click from coming
 *  back, wherever the team is looking at it. */
import { useState } from "react";
import { PHASES, cancelInfo, journeyOf } from "@/lib/journey";
import { isPaid } from "@/lib/payState";
import type { Booking } from "@/lib/types";
import { Button, Input } from "@/components/ui";

export async function lifecycle(id: string, action: "cancel" | "restore", reason = ""): Promise<{ ok: true; booking: Booking } | { ok: false; error: string }> {
  const r = await fetch("/api/admin/lifecycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: j.detail ?? j.error ?? `HTTP_${r.status}` };
  window.dispatchEvent(new Event("bagdrop:bookings-changed"));
  return { ok: true, booking: j.booking as Booking };
}

/** Undo an approval made by mistake — only while it's still safe (gated again,
 *  for real, on the server): no money captured and no LR/invoice/Estimate
 *  issued yet. Once any of those are real, this button is hidden — Cancel
 *  booking is the only way back from there. */
const canUnapprove = (b: Booking): boolean =>
  b.status === "accepted" && !isPaid(b) && !b.pay && !(b.docs ?? []).some((d) => d.type === "LR" || d.type === "INV" || d.type === "PI");

export default function JourneyPanel({ b, compact = false, onChanged, onOpenOps }: {
  b: Booking; compact?: boolean; onChanged?: (b: Booking) => void; onOpenOps?: () => void;
}) {
  const j = journeyOf(b);
  const c = cancelInfo(b);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const act = async (action: "cancel" | "restore") => {
    setBusy(true); setErr("");
    try { const r = await lifecycle(b.id, action, reason); if (r.ok) { setCancelling(false); setReason(""); onChanged?.(r.booking); } else setErr(r.error); }
    finally { setBusy(false); }
  };
  const unapprove = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, rev: b.rev, decision: "unapprove" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.detail ?? j.error ?? `HTTP_${r.status}`); return; }
      window.dispatchEvent(new Event("bagdrop:bookings-changed"));
      onChanged?.(j.booking as Booking);
    } finally { setBusy(false); }
  };
  const tone = j.closed === "cancelled" || j.closed === "declined" ? "var(--a-bad, #b91c1c)" : j.phase === 5 ? "var(--a-ok, #15803d)" : "var(--brand, #FD6201)";
  return (
    <div className={`rounded-xl border border-line ${compact ? "p-2.5" : "p-3"}`} data-journey={j.phase}>
      <ol className="flex flex-wrap items-center gap-1 text-[11px]">
        {PHASES.map((p, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
          const done = n < j.phase, cur = n === j.phase;
          return (
            <li key={p} className="flex items-center gap-1">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${cur ? "text-white" : done ? "bg-paper text-ink" : "bg-paper text-faint"}`} style={cur ? { background: tone } : undefined}>{n} · {p}</span>
              {i < PHASES.length - 1 && <span className="text-faint">›</span>}
            </li>
          );
        })}
      </ol>
      <p className={`mt-2 ${compact ? "text-xs" : "text-[13px]"}`}>
        <b>{j.closed === "cancelled" ? "Cancelled" : j.closed === "declined" ? "Declined" : j.closed === "delivered" ? "Delivered" : "Next"}:</b> {j.next}
        {j.cancelReason && <span className="text-muted"> Reason: {j.cancelReason}.</span>}
        {!j.closed && <span className="text-muted"> · {j.where}</span>}
        {!j.closed && j.phase >= 3 && onOpenOps && <button className="ml-2 cursor-pointer font-semibold text-brand hover:underline" onClick={onOpenOps}>Open in Operations</button>}
      </p>
      {c && (
        <p className="mt-1 text-[11px] text-muted">Cancelled on {new Date(c.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} by {c.by} · it was <b>{c.from.status.replace("_", " ")}</b>{c.paidAtCancel ? " · paid" : ""}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {b.status === "cancelled" && <Button size="sm" disabled={busy} onClick={() => void act("restore")}>Restore booking</Button>}
        {canUnapprove(b) && !cancelling && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unapprove()}>Back to needs decision</Button>}
        {b.status !== "cancelled" && b.status !== "delivered" && b.status !== "rejected" && !cancelling && (
          <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Cancel booking</Button>
        )}
        {cancelling && (
          <>
            <Input className="flex-1 py-1.5 text-xs" placeholder="Why? The client is told this reason." value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" disabled={busy || reason.trim().length < 5} onClick={() => void act("cancel")}>Cancel and tell the client</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCancelling(false); setReason(""); }}>Keep it</Button>
          </>
        )}
        <a className="ml-auto text-[11px] font-semibold text-muted hover:text-brand" href="/admin/guide" target="_blank" rel="noreferrer">How this works</a>
        <a className="text-[11px] font-semibold text-muted hover:text-brand" href="/admin/tutorial" target="_blank" rel="noreferrer">Tutorial</a>
      </div>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}
