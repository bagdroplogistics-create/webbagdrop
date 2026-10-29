/** B2B partner (agent) model + session auth — travel agents, event
 *  companies and hotels who book Bagdrop for their clients, collect the
 *  payment themselves, keep their commission, and remit the rest.
 *
 *  Commission is set per agent by the Bagdrop admin team: a percentage of
 *  the retail fare, or a fixed rupee amount per billed bag. Agents always
 *  see and book at the RETAIL rate chart; their margin is the commission.
 *  Server-only (crypto + service role). */
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { serviceClient } from "./supabaseAdmin";
import type { Booking } from "./types";

export interface WalletTxn {
  at: string;
  amount: number;          // +credit into the wallet, −debit (a booking)
  kind: "topup" | "settlement" | "booking" | "adjust";
  ref?: string;            // NEFT/UPI reference for topups & settlements
  note?: string;
  bookingId?: string;
}

export interface Agent {
  id: string;
  name: string;            // contact person
  company: string;
  type: "travel agent" | "event company" | "hotel";
  mobile: string;
  email?: string;
  /* statutory & account details for the B2B account */
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  bank?: { holder?: string; account?: string; ifsc?: string; upi?: string }; // for commission payouts
  code: string;            // login id, e.g. AG-TRIPON
  key: string;             // access key (shown once to admin, stored as-is for v1)
  commission: { mode: "pct" | "perbag"; value: number };
  /* OPTIONAL billing trial — default "remit" keeps today's behaviour.
   * wallet: agent pre-pays; every booking debits FULL RETAIL from the wallet.
   * credit: Bagdrop extends a limit; bookings debit against it (balance may
   *         go negative down to −creditLimit), settlements bring it back.
   * In both, the commission accrues as PAYABLE BACK to the agent and is
   * paid out separately (recorded in commissionPayouts). */
  billing?: { mode: "remit" | "wallet" | "credit"; creditLimit?: number };
  wallet?: { balance: number; txns: WalletTxn[] };
  commissionPayouts?: { at: string; amount: number; note?: string }[];
  remitted: { at: string; amount: number; note?: string }[];
  created: string;
}

export const billingMode = (a: Agent): "remit" | "wallet" | "credit" => a.billing?.mode ?? "remit";

/** Apply one wallet transaction, returning the updated agent. */
export function walletApply(a: Agent, txn: Omit<WalletTxn, "at">): Agent {
  const w = a.wallet ?? { balance: 0, txns: [] };
  return { ...a, wallet: { balance: Math.round(w.balance + txn.amount), txns: [...w.txns, { at: new Date().toISOString(), ...txn }] } };
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const gstinLooksValid = (g?: string) => !g || GSTIN_RE.test(g.trim().toUpperCase());
export const panLooksValid = (p?: string) => !p || PAN_RE.test(p.trim().toUpperCase());

/* ---------- storage (settings table, same pattern as vendors) ---------- */
export async function loadAgents(): Promise<Agent[]> {
  const sb = serviceClient();
  if (!sb) return [];
  const { data, error } = await sb.from("settings").select("doc").eq("id", "agents").maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.doc as { agents?: Agent[] })?.agents ?? []);
}
export async function saveAgents(agents: Agent[]): Promise<void> {
  const sb = serviceClient()!;
  const { error } = await sb.from("settings").upsert({ id: "agents", doc: { agents }, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export const newAgentKey = () => randomBytes(9).toString("base64url");

/* ---------- partner session cookie (separate from the admin cookie) ---------- */
const SECRET = () => process.env.ADMIN_SECRET_KEY ?? "dev-admin-key-change-me";
const sig = (p: string) => createHmac("sha256", "partner:" + SECRET()).update(p).digest("hex");

export function makePartnerToken(agentId: string, hours = 24 * 7): string {
  const expires = Date.now() + hours * 3600_000;
  const payload = `${agentId}:${expires}`;
  return `${payload}:${sig(payload)}`;
}
export function verifyPartnerToken(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(":");
  if (i < 0) return null;
  const payload = token.slice(0, i), got = token.slice(i + 1);
  const want = sig(payload);
  const a = Buffer.from(want), b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [agentId, exp] = payload.split(":");
  if (!agentId || Number(exp) < Date.now()) return null;
  return agentId;
}
export function partnerIdFromCookies(cookieHeader: string | null): string | null {
  const m = (cookieHeader ?? "").match(/(?:^|;\s*)bagdrop_partner=([^;]+)/);
  return verifyPartnerToken(m ? decodeURIComponent(m[1]) : undefined);
}

/* ---------- ledger math ---------- */
export function commissionFor(a: Agent, b: Booking): number {
  const total = b.pay?.amount ?? b.quote.total ?? 0;
  if (a.commission.mode === "pct") return Math.round((total * a.commission.value) / 100);
  return Math.round(a.commission.value * (b.billed || b.bags));
}
export interface LedgerRow {
  id: string; created: string; status: string; lane: string; client: string;
  bags: number; retail: number; commission: number; net: number; date: string;
  billing: "remit" | "wallet" | "credit";
}
export interface Ledger {
  rows: LedgerRow[];
  retail: number; commission: number; net: number; remitted: number; outstanding: number;
  /* wallet/credit view — zeroes for pure remit agents */
  billingMode: "remit" | "wallet" | "credit";
  walletBalance: number; creditLimit: number; creditAvailable: number;
  commissionDue: number; commissionPaidOut: number;
}
export function ledgerFor(a: Agent, bookings: Booking[]): Ledger {
  const mine = bookings.filter((b) => (b.admin as { agentId?: string }).agentId === a.id);
  const rows: LedgerRow[] = mine.map((b) => {
    const retail = b.pay?.amount ?? b.quote.total ?? 0;
    const commission = commissionFor(a, b);
    const billing = ((b.admin as { agentBilling?: string }).agentBilling ?? "remit") as LedgerRow["billing"];
    return {
      id: b.id, created: b.created, status: b.status, lane: `${b.from} → ${b.to}`,
      client: b.traveller.name, bags: b.bags + b.oversize, retail, commission,
      /* remit: the agent owes retail−commission. wallet/credit: full retail
       * was already charged, so nothing further is owed per booking. */
      net: billing === "remit" ? retail - commission : 0,
      date: b.date, billing,
    };
  }).sort((x, y) => y.created.localeCompare(x.created));
  const retail = rows.reduce((s, r) => s + r.retail, 0);
  const commission = rows.reduce((s, r) => s + r.commission, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const remitted = (a.remitted ?? []).reduce((s, r) => s + r.amount, 0);
  const walletBalance = a.wallet?.balance ?? 0;
  const creditLimit = a.billing?.creditLimit ?? 0;
  /* commission earned on wallet/credit bookings is paid BACK to the agent */
  const walletCommission = rows.filter((r) => r.billing !== "remit").reduce((s, r) => s + r.commission, 0);
  const commissionPaidOut = (a.commissionPayouts ?? []).reduce((s, p) => s + p.amount, 0);
  return {
    rows, retail, commission, net, remitted, outstanding: net - remitted,
    billingMode: billingMode(a),
    walletBalance, creditLimit,
    creditAvailable: billingMode(a) === "credit" ? creditLimit + walletBalance : walletBalance,
    commissionDue: walletCommission - commissionPaidOut, commissionPaidOut,
  };
}
