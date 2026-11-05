/** ONE journey for every booking — website, wedding or event, partner.
 *  Five phases, named the same on every screen:
 *   1 Received      the request is in; price or rate to confirm
 *   2 Confirmed     the team approved it (or the hosts confirmed the family)
 *   3 Paid / billed payment verified, partner wallet charged or host billed —
 *                   this is what starts the operation (LR, captain)
 *   4 Moving        pickup → middle mile → last mile, with proof at each step
 *   5 Completed     delivered with POD — or closed (cancelled / declined)
 *  Pure functions: the Shipments inbox, Weddings, Operations and the guide
 *  all read the same answer to "where is it, what's next, who does it". */
import { MILESTONES, opsOf, type MilestoneKey } from "./opsModel";
import { isPaid } from "./payState";
import type { Booking } from "./types";

export const PHASES = ["Received", "Confirmed", "Paid / billed", "Moving", "Completed"] as const;
export type Phase = 1 | 2 | 3 | 4 | 5;

/** What a shipment waits for, step by step (Operations list and the journey panel). */
export const NEXT_LABEL: Record<MilestoneKey, string> = {
  lr: "Issuing LR", assign: "To assign pickup", picked: "To pick up", inscan: "To reach origin hub", depart: "To depart",
  arrive: "In transit", ofd: "To go out for delivery", pod: "Out for delivery",
};
/** Where each step is done. */
const WHERE: Record<MilestoneKey, string> = {
  lr: "automatic (or Operations)", assign: "Operations · Legs", picked: "captain's driver link (or Operations)", inscan: "Operations", depart: "Operations",
  arrive: "Operations", ofd: "Operations", pod: "delivery captain's link (or Operations)",
};

export interface Journey {
  phase: Phase;
  label: (typeof PHASES)[number];
  /** one line: what happens next */
  next: string;
  /** where the team does it */
  where: string;
  /** closed how, when the phase is Completed */
  closed?: "delivered" | "cancelled" | "declined";
  /** why it was cancelled, when it was */
  cancelReason?: string;
}

export const settled = (b: Booking) => isPaid(b) || !!b.payer;
export const cancelInfo = (b: Booking) => (b.admin as { cancel?: CancelRecord }).cancel ?? null;
/** Stamped on the booking when it is cancelled, so Restore can put it back exactly. */
export interface CancelRecord { at: string; by: string; reason: string; from: { status: Booking["status"] }; paidAtCancel?: boolean }

export function journeyOf(b: Booking): Journey {
  const o = opsOf(b);
  const ms = o.milestones ?? {};
  if (b.status === "cancelled") return { phase: 5, label: "Completed", closed: "cancelled", cancelReason: cancelInfo(b)?.reason, next: "Cancelled. Restore puts it back exactly where it was.", where: "Shipments · Restore" };
  if (b.status === "rejected") return { phase: 5, label: "Completed", closed: "declined", next: "Declined by the team.", where: "Shipments" };
  if (b.status === "delivered" || ms.pod) return { phase: 5, label: "Completed", closed: "delivered", next: `Delivered${b.pod?.receiver ? ` to ${b.pod.receiver}` : ""}. POD on file.`, where: "Operations" };
  const decision = (b.admin as { decision?: { state?: string } }).decision?.state;
  if (["quoted", "identified", "submitted", "revised"].includes(b.status) || decision === "hold" || decision === "info") {
    const why = decision === "hold" ? "On hold." : decision === "info" ? "Waiting for the client's answer." : b.quote.breakdown?.ror || !(b.quote.total > 0) ? "No chart price: set the team price." : "Price is ready.";
    return { phase: 1, label: "Received", next: `${why} Accept, revise, or decline.`, where: "Shipments · Quotes & payments" };
  }
  if (!settled(b)) {
    const pay = b.pay?.status === "submitted" ? "Client says they paid: verify it in Finance." : "Waiting for the client's payment (link sent).";
    return { phase: 2, label: "Confirmed", next: pay, where: b.pay?.status === "submitted" ? "Finance · Payments to verify" : "client (payment link)" };
  }
  const nextStep = MILESTONES.find((m) => !ms[m.key]);
  if (!ms.picked) {
    const k = nextStep?.key ?? "lr";
    return { phase: 3, label: "Paid / billed", next: NEXT_LABEL[k] + (k === "lr" ? " (automatic within a minute)" : ""), where: WHERE[k] };
  }
  const k = nextStep?.key ?? "pod";
  return { phase: 4, label: "Moving", next: NEXT_LABEL[k], where: WHERE[k] };
}

/** The list badge: one short label per booking. */
export function nextLabel(b: Booking): string {
  const j = journeyOf(b);
  if (j.phase === 5) return j.closed === "delivered" ? "Delivered" : j.closed === "cancelled" ? "Cancelled" : "Declined";
  if (j.phase === 1) return "To decide";
  if (j.phase === 2) return "Waiting for payment";
  return j.next.replace(/ \(.*\)$/, "");
}
