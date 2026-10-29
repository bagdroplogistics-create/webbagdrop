/** The complete LR / Consignment Note field model — every field of the
 *  official Bagdrop format (BDLR series). Shared by the Make-LR form, the
 *  printed document, the auto-draft pass and the issue API. */
import type { Booking } from "./types";

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

const MISSING = "Missing";

function fmtDate(raw?: string | null): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export interface OpsNote {
  customerName: string;
  pickupAddress: string;
  pickupWhen: string;
  deliveryAddress: string;
  deliveryWhen: string;
  bags: string;
}

/** The basic operations note — just the six essentials a pickup/delivery
 *  team needs, pulled straight off the booking (and the LR's own edited
 *  fields, when a field was overridden on the LR form) at the moment the
 *  LR exists. Nothing here is invented: an absent field prints "Missing"
 *  (or "Not specified" for delivery date/time, since that one is only
 *  "if applicable"). Purely derived — not stored, so it can't go stale
 *  and issuing an LR doesn't need to change at all. */
export function buildOpsNote(b: Booking, lr?: LrDetails): OpsNote {
  const name = (lr?.consignee ?? b.traveller?.name ?? "").trim() || MISSING;
  const pickupAddress = (lr?.fromAddr ?? b.pickAddr ?? "").trim() || MISSING;
  const deliveryAddress = (lr?.toAddr ?? b.dropAddr ?? "").trim() || MISSING;

  const pickupDate = fmtDate(b.pickupDate || b.date);
  const pickupTime = (b.slot ?? "").trim();
  const pickupWhen = pickupDate ? `${pickupDate}${pickupTime ? `, ${pickupTime}` : " (time missing)"}` : MISSING;

  const deliveryDate = fmtDate(b.deliveryDate);
  const deliveryWhen = deliveryDate || "Not specified";

  const bagCount = lr?.pieces ?? (b.bags ?? 0) + (b.oversize ?? 0);
  const bags = bagCount > 0 ? String(bagCount) : MISSING;

  return { customerName: name, pickupAddress, pickupWhen, deliveryAddress, deliveryWhen, bags };
}
