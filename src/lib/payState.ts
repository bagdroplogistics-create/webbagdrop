/** The ONE definition of "paid". A booking carries a `pay` object from the
 *  moment a customer reports a payment, but money only counts once finance
 *  has verified it (status "captured"). Every reader of payment state must
 *  go through these helpers — reading `!!b.pay` as "paid" is what sent
 *  "payment received" messages for payments that never happened. */
import type { Booking } from "./types";

export const isPaid = (b: Pick<Booking, "pay">): boolean => b.pay?.status === "captured";

/** Verified money received on this booking (0 until finance verifies). */
export const paidAmount = (b: Pick<Booking, "pay">): number => (isPaid(b) ? b.pay!.amount : 0);

/** When the money counted — verification time, falling back to capture. */
export const paidAt = (b: Pick<Booking, "pay">): string | null =>
  isPaid(b) ? (b.pay!.verifiedAt ?? b.pay!.at) : null;

/** A customer has reported a payment that finance has not yet decided. */
export const awaitingVerification = (b: Pick<Booking, "pay">): boolean =>
  b.pay?.status === "submitted" || b.pay?.topup?.status === "submitted";
