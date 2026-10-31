/** The CUSTOMER-SAFE projection of a booking — what the client dashboard
 *  and the public payment page may see. Never exposes staff notes, admin
 *  internals, CTO flags, identity method details, or full contact data of
 *  anyone else. Server-only (reads payconfig from the settings table). */
import { serviceClient } from "./supabaseAdmin";
import { isPaid } from "./payState";
import type { Booking } from "./types";

export interface PayConfig {
  upiId?: string; payeeName?: string; bankName?: string; accountName?: string;
  accountNo?: string; ifsc?: string; note?: string;
}

export async function loadPayConfig(): Promise<PayConfig> {
  const sb = serviceClient();
  if (!sb) return {};
  const { data } = await sb.from("settings").select("doc").eq("id", "payconfig").maybeSingle();
  return (data?.doc as PayConfig | null) ?? {};
}

export type Decision = { state: "pending" | "approved" | "rejected" | "hold" | "info"; note?: string; at?: string };

export function decisionOf(b: Booking): Decision {
  const d = (b.admin as { decision?: Decision }).decision;
  if (d) return d;
  if (b.status === "rejected" || b.status === "cancelled") return { state: "rejected" };
  if (["accepted", "assigned", "picked_up", "in_transit", "delivered"].includes(b.status)) return { state: "approved" };
  return { state: "pending" };
}

export interface ClientBookingView {
  id: string; created: string; status: string; decision: Decision;
  service: string; mode: string; from: string; to: string;
  pickAddr: string; dropAddr: string; date: string; slot: string; ref: string;
  deliveryDate: string | null; bags: number; oversize: number;
  priced: boolean; total: number; validUntil: string | null;
  pay: null | {
    status: string; amount: number; utr?: string; rejectedNote?: string; hasProof: boolean;
    topup: null | { amount: number; status: string; rejectedNote?: string; hasProof: boolean };
  };
  paid: boolean; balanceDue: number;
  identityOk: boolean; indemnitySigned: boolean;
  canEdit: boolean; canPay: boolean; locked: boolean;
}

const MOVED = ["picked_up", "in_transit", "delivered"];

export function clientView(b: Booking): ClientBookingView {
  const decision = decisionOf(b);
  const paid = isPaid(b);
  const priced = !b.quote.breakdown?.ror && b.quote.total > 0;
  const topup = b.pay?.topup ?? null;
  const balanceDue = paid ? Math.max(0, (topup && topup.status !== "submitted" ? topup.amount : 0)) : (priced ? b.quote.total : 0);
  const closed = ["rejected", "cancelled"].includes(b.status) || MOVED.includes(b.status);
  return {
    id: b.id, created: b.created, status: b.status, decision,
    service: b.ucName, mode: b.mode, from: b.from, to: b.to,
    pickAddr: b.pickAddr, dropAddr: b.dropAddr, date: b.date, slot: b.slot, ref: b.ref,
    deliveryDate: b.deliveryDate ?? null, bags: b.bags, oversize: b.oversize,
    priced, total: b.quote.total || 0, validUntil: b.quote.validUntil ?? null,
    pay: b.pay ? {
      status: b.pay.status, amount: b.pay.amount, utr: b.pay.utr, rejectedNote: b.pay.rejectedNote,
      hasProof: !!b.pay.proof,
      topup: topup ? { amount: topup.amount, status: topup.status, rejectedNote: topup.rejectedNote, hasProof: !!topup.proof } : null,
    } : null,
    paid, balanceDue,
    identityOk: !!b.identity?.ok, indemnitySigned: !!b.indemnity,
    /* edits allowed while open; after payment only ADDING bags (enforced server-side) */
    canEdit: !closed && b.pay?.status !== "submitted",
    /* payment is invited only once the team has approved the booking */
    canPay: !closed && decision.state === "approved" && priced && (!paid || (topup?.status === "due" || topup?.status === "rejected")),
    locked: paid,
  };
}
