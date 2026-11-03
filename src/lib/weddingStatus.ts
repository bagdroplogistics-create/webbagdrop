/** How a wedding family's booking reads to the team: waiting for the team's
 *  OK, confirmed, on the move, done. Shared by the Weddings and the Events
 *  & bulk modules so "accepted" in Shipments shows the same everywhere. */
import type { Booking, BookingStatus } from "./types";

type Tone = "ok" | "warn" | "bad" | "info" | "muted";
export type WeddingStage = "waiting" | "confirmed" | "moving" | "done" | "closed";

export function weddingStatus(b: Pick<Booking, "status">): { label: string; tone: Tone; stage: WeddingStage } {
  switch (b.status) {
    case "quoted": case "identified": case "submitted": case "revised":
      return { label: "Awaiting approval", tone: "warn", stage: "waiting" };
    case "accepted": return { label: "Confirmed", tone: "ok", stage: "confirmed" };
    case "assigned": return { label: "Confirmed · captain assigned", tone: "ok", stage: "confirmed" };
    case "picked_up": case "in_transit": return { label: "On the move", tone: "info", stage: "moving" };
    case "delivered": return { label: "Delivered", tone: "ok", stage: "done" };
    default: return { label: b.status === "rejected" ? "Declined" : "Cancelled", tone: "bad", stage: "closed" };
  }
}

/** Families still waiting for the team, and families the team has confirmed (or later). */
export function approvalCounts(list: Pick<Booking, "status">[]) {
  let waiting = 0, confirmed = 0;
  for (const b of list) {
    const s = weddingStatus(b).stage;
    if (s === "waiting") waiting++;
    else if (s !== "closed") confirmed++;
  }
  return { waiting, confirmed };
}

/** Guest booking cut-off: the event's bookingCloses date, end of day IST.
 *  No date set means bookings stay open while the event is open. */
export function bookingOpen(ev: { bookingCloses?: string } | null | undefined, now = Date.now()): boolean {
  if (!ev?.bookingCloses) return true;
  return now <= Date.parse(`${ev.bookingCloses}T23:59:59.999+05:30`);
}
export const closesText = (ev: { bookingCloses?: string } | null | undefined): string =>
  ev?.bookingCloses ? new Date(`${ev.bookingCloses}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

/** Bag stages that mean the bag is back with Bagdrop for the trip home. */
export const RETURN_DONE = ["Return pickup", "Delivered home"];

/** The Y2K desk's stage -> booking-status machine. */
export function statusForStage(stageIndex: number, current: BookingStatus): BookingStatus {
  let s = current;
  if (stageIndex >= 1 && stageIndex <= 2 && ["submitted", "accepted", "assigned"].includes(s)) s = "picked_up";
  if (stageIndex === 3 || stageIndex === 4 || stageIndex === 6) s = "in_transit";
  if (stageIndex === 5 || stageIndex === 7) s = "delivered";
  return s;
}
