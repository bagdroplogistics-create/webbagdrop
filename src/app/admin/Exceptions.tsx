"use client";
/** Admin OS · Exceptions — ported from the static build's m-exc module
 *  (admin.html:321-346, admin.js:1041-1056). The original queue was 100%
 *  hardcoded demo rows (4 fixed fake "seal mismatch"/"missed pickup" lines)
 *  with buttons that only showed a toast — its own caption admitted "the
 *  queue fills from live rules in production" was aspirational. This
 *  builds that real version instead: exceptions genuinely derived from
 *  live bookings, with an action that actually logs to the booking. The
 *  static build's "automatic response" reference table is preserved as-is
 *  since it's real operating policy, just not automated. */
import { useEffect, useMemo, useState } from "react";
import { useNow } from "@/lib/useNow";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import type { Booking } from "@/lib/types";
import type { ProductionLead } from "../api/admin/production-leads/route";
import { useProductionLeads } from "@/lib/useProductionLeads";
import { Badge, Button, Card } from "@/components/ui";

interface ExceptionRow { key: string; bookingId: string; sev: "bad" | "warn"; text: string; action: string; prod?: boolean }

const RESPONSES: [string, string][] = [
  ["Seal mismatch at handover", "Hold shipment · notify customer · photo evidence required before release"],
  ["Missed pickup window", "Auto-reschedule next slot · WhatsApp the customer · log reason"],
  ["Cutoff at risk (flight < 2h)", "Escalate to ops lead · offer next available slot"],
  ["Over 32 kg declared", "Oversize surcharge applied · confirm with customer before pickup"],
  ["Identity review band (0.70-0.85)", "Customer re-confirms name match before capture proceeds"],
  ["Address changed after booking", "Re-verify pickup/delivery address · re-check route pricing"],
  ["Damage claim raised", "Open claim file · insurance threshold ₹50,000/shipment · 48h response"],
  ["No-show at pickup", "Hold 2h · second attempt · cancellation fee after 2 missed attempts"],
];

function hrs(iso: string) { return (Date.now() - new Date(iso).getTime()) / 3600000; }

export function deriveExceptions(all: Booking[]): ExceptionRow[] {
  const out: ExceptionRow[] = [];
  const acked = (b: Booking, key: string) => ((b.admin as Record<string, unknown>).ackExceptions as string[] | undefined)?.includes(key);

  all.forEach((b) => {
    if (b.identity && b.identity.score >= 0.7 && b.identity.score < 0.85 && !acked(b, "identity")) {
      out.push({ key: "identity", bookingId: b.id, sev: "warn", text: `Identity matched at ${b.identity.score.toFixed(2)} — in the review band, needs a human check.`, action: "Mark reviewed" });
    }
    if (b.status === "submitted" && hrs(b.created) > 2 && !acked(b, "decision_overdue")) {
      out.push({ key: "decision_overdue", bookingId: b.id, sev: "bad", text: `Needs a decision — waiting ${Math.round(hrs(b.created))}h with no response.`, action: "Escalate" });
    }
    if (b.status === "revised" && hrs(b.events[b.events.length - 1]?.at ?? b.created) > 24 && !acked(b, "revision_stale")) {
      out.push({ key: "revision_stale", bookingId: b.id, sev: "bad", text: "Revised price sent over 24h ago with no customer response.", action: "Follow up" });
    }
    if ((b.status === "quoted" || b.status === "identified") && b.quote.validUntil && new Date(b.quote.validUntil) < new Date() && !acked(b, "lock_expired")) {
      out.push({ key: "lock_expired", bookingId: b.id, sev: "warn", text: "Price lock expired, unpaid — customer will need a fresh quote.", action: "Acknowledge" });
    }
  });
  return out;
}

/** Same "decision overdue" rule as deriveExceptions, for bagdrop.co's real
 *  leads — a lead still in new/contacted/qualified more than 2h after it
 *  came in. No equivalent of ackExceptions exists on a production lead, so
 *  these rows are informational only (acted on from Shipments instead). */
export function deriveProductionExceptions(leads: ProductionLead[]): ExceptionRow[] {
  const PRE_CONVERT = ["new", "contacted", "qualified"];
  return leads
    .filter((l) => PRE_CONVERT.includes(l.status) && hrs(l.createdAt) > 2)
    .map((l) => ({
      key: "decision_overdue", bookingId: l.leadNumber ?? l.id.slice(0, 8), sev: "bad" as const,
      text: `Needs a decision — waiting ${Math.round(hrs(l.createdAt))}h with no response.`, action: "Open in Shipments", prod: true,
    }));
}

export default function Exceptions() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  const { leads: prodLeads } = useProductionLeads();

  // deriveExceptions reads the clock — only once in the browser (useNow), so
  // the server render and hydration always match; refreshed every minute.
  const now = useNow();
  const rows = useMemo<ExceptionRow[]>(() => (now ? [...deriveExceptions(bookings), ...deriveProductionExceptions(prodLeads)] : []), [now, bookings, prodLeads]);
  const [busy, setBusy] = useState<string | null>(null);

  async function ack(row: ExceptionRow) {
    const b = bookings.find((x) => x.id === row.bookingId);
    if (!b) return;
    setBusy(row.key + row.bookingId);
    const current = ((b.admin as Record<string, unknown>).ackExceptions as string[] | undefined) ?? [];
    await adminApplyPatch(b, { admin: { ...b.admin, ackExceptions: [...current, row.key] } }, `Exception "${row.text}" — ${row.action.toLowerCase()}`);
    setBusy(null);
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Exception queue <Badge tone={rows.length ? "warn" : "ok"}>{rows.length} open</Badge></h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged right now.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key + r.bookingId} className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-2 text-sm last:border-0">
                <div>
                  <Badge tone={r.sev === "bad" ? "bad" : "warn"}>{r.bookingId}</Badge>
                  <p className="mt-1 text-xs text-muted">{r.text}</p>
                </div>
                {!r.prod && (
                  <Button size="sm" variant="outline" disabled={busy === r.key + r.bookingId} onClick={() => void ack(r)}>
                    {busy === r.key + r.bookingId ? "…" : r.action}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Exception type → standard response</h3>
        <ul className="space-y-1.5 text-xs">
          {RESPONSES.map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3 border-b border-dashed border-line py-1 last:border-0">
              <span className="font-medium">{k}</span><span className="text-right text-muted">{v}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
