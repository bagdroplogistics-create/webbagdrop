/** Quote desk rules shared by the server (lib/inquiryEdit.ts) and the
 *  screen (admin/QuotesAndPayments.tsx) — no server-only imports here. */
import { isPaid } from "./payState";
import type { Booking } from "./types";

/** Statuses the quote desk works on. "accepted" stays open until the
 *  customer pays, so an approved price can still be revised. */
export const DESK_STATUSES: Booking["status"][] = ["submitted", "revised", "quoted", "identified", "accepted"];

/** Why a booking can't be changed from the quote desk, or null if it can. */
export function deskLock(b: Booking): string | null {
  if (isPaid(b)) return "Payment is verified — changes now go through Shipments.";
  if (b.payer) return "Billed to a partner or to the wedding hosts — confirm it in the Shipments inbox.";
  if (b.pay?.status === "submitted") return "The customer has sent payment proof — verify or reject it in Finance first.";
  if (!DESK_STATUSES.includes(b.status)) return `This booking is ${b.status.replace("_", " ")} — it can no longer be changed here.`;
  return null;
}
