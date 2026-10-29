/** The complete LR / Consignment Note field model — every field of the
 *  official Bagdrop format (BDLR series). Shared by the Make-LR form, the
 *  printed document, the auto-draft pass and the issue API. */

export const CHARGE_HEADS = [
  ["freight", "Freight"],
  ["surcharge", "Surcharge"],
  ["localCartage", "Local Cartage"],
  ["lastMile", "Last Mile Frt"],
  ["fov", "FOV"],
  ["loading", "Loading Chg"],
  ["unloading", "Unloading Chg"],
  ["handling", "Handling Chg"],
  ["gcCharge", "GC Charge"],
  ["other", "Other Charge"],
  ["ewayCharge", "Eway Bill Chg"],
  ["aoc", "AOC"],
] as const;
export type ChargeKey = (typeof CHARGE_HEADS)[number][0];

export const GST_PAYABLE = ["Consignor", "Consignee", "Transporter"] as const;
export const PAYMENT_TERMS = ["Paid", "To Pay", "To be Billed"] as const;
export const LR_TYPES = ["At Branch", "Door Booking", "Online"] as const;
export const DELIVERY_AT = ["Door Dly", "Branch Dly", "Airport Dly"] as const;

export interface LrDetails {
  /* parties */
  consignor?: string; consignorMobile?: string; consignorGstin?: string;
  consignee?: string; consigneeMobile?: string; consigneeGstin?: string;
  billedTo?: string; billedToGstin?: string;
  /* transport */
  vehicleNo?: string; mode?: string; ewayBill?: string;
  fromAddr?: string; toAddr?: string;
  /* package */
  pieces?: number; content?: string;
  weightKg?: number;        // actual weight
  chargedWeightKg?: number; // charged weight
  size?: string;            // L×W×H
  privateMark?: string; tiTag?: string;
  /* commercials */
  declaredValue?: number; invoiceRef?: string;
  charges?: Partial<Record<ChargeKey, number>>;
  /* terms */
  insured?: "Yes" | "No";
  gstPayableBy?: string; paymentTerms?: string; lrType?: string; deliveryAt?: string;
  note?: string;
}

/** Charges math exactly as the printed format: sum of heads = Sub Total,
 *  CGST 2.5% + SGST 2.5% on it, Total. */
export function lrTotals(d: LrDetails | undefined, fallbackTotalInclGst: number) {
  const ch = d?.charges;
  if (!ch || Object.values(ch).every((v) => !v)) {
    /* no charges entered → derive from the booking's GST-inclusive total */
    const taxable = Math.round(fallbackTotalInclGst / 1.05);
    const gst = fallbackTotalInclGst - taxable;
    const cgst = Math.round(gst / 2);
    return { heads: { freight: taxable } as Partial<Record<ChargeKey, number>>, subTotal: taxable, cgst, sgst: gst - cgst, total: fallbackTotalInclGst };
  }
  const subTotal = CHARGE_HEADS.reduce((s, [k]) => s + Math.round(Number(ch[k]) || 0), 0);
  const cgst = Math.round(subTotal * 0.025);
  const sgst = Math.round(subTotal * 0.025);
  return { heads: ch, subTotal, cgst, sgst, total: subTotal + cgst + sgst };
}
