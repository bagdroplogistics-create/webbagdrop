/** Pricing and minimum-bag rules for the Wedding Y2K event (#Y2K-WED) only.
 *  Imported by both the client wizard (y2k-logic.ts) and the server-side
 *  save route (api/wedding/booking/route.ts) so the two can never disagree,
 *  and by the admin Weddings view for display. Nothing here applies to any
 *  other booking type — regular bookings price through src/lib/pricing.ts.
 *
 *  Insurance is 0 (shown as "to be confirmed") until the team sets a real
 *  per-bag rate — update ONLY the constant below, no other change needed. */
export const Y2K_PER_BAG_INR = 1500; // GST-inclusive, final — no GST added on top
export const Y2K_INSURANCE_PER_BAG_INR = 0; // set once the team confirms a rate

export const Y2K_MIN_BAGS_PER_ADDRESS = 2;
export const Y2K_MIN_BAGS_MESSAGE = "Minimum 2 bags are required per pickup address for Wedding Y2K bookings.";
export const Y2K_CANCEL_POLICY =
  "Once your Wedding Y2K inquiry has been submitted, the booking cannot be cancelled online. If you need to request a cancellation, please contact our Bagdrop team directly at 6357115711.";

export function y2kQuote(bagCount: number) {
  const bagTotal = Y2K_PER_BAG_INR * bagCount;
  const insuranceTotal = Y2K_INSURANCE_PER_BAG_INR * bagCount;
  return { bagTotal, insuranceTotal, total: bagTotal + insuranceTotal };
}

/** Pickup addresses that are actually in use (have at least one member
 *  assigned) but fall short of the per-address minimum. Bags are matched to
 *  a pickup via bag.pickup === pickup.id, the same link waText() already
 *  uses on the client. */
export function y2kShortPickups(
  pickups: { id: string; members?: string[] }[],
  bags: { pickup?: string }[]
): string[] {
  return pickups
    .filter((p) => (p.members?.length ?? 0) > 0)
    .filter((p) => bags.filter((b) => b.pickup === p.id).length < Y2K_MIN_BAGS_PER_ADDRESS)
    .map((p) => p.id);
}
