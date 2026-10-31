/** Client Master — one record per client, keyed by normalized mobile.
 *  The master powers new bookings (prefill), links every past/present/
 *  future booking to the person, carries the handling category, and is
 *  segregated by Indian financial year (April–March). Server-only. */
import { serviceClient } from "./supabaseAdmin";
import { cleanMobile, cleanEmail } from "./otp";
import type { Booking } from "./types";
import { paidAmount } from "./payState";

export const CLIENT_CATEGORIES = ["New", "Repeat", "VIP", "Wedding", "B2B", "Dormant"] as const;
export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];

export interface ClientRecord {
  id: string;              // CL-<mobile>
  name: string;
  mobile: string;          // normalized 91XXXXXXXXXX — THE identity key
  email?: string;
  address?: string; city?: string; state?: string; pincode?: string;
  dob?: string;            // yyyy-mm-dd
  gstin?: string;
  category?: ClientCategory;   // manual override; blank = auto
  tags?: string[];
  notes?: string;
  source?: string;         // "booking" | "import" | "manual"
  createdAt: string;
  updatedAt?: string;
}

export interface FyStat { fy: string; bookings: number; revenue: number }

export interface ClientView extends ClientRecord {
  autoCategory: ClientCategory;
  effectiveCategory: ClientCategory;
  bookingsPast: string[]; bookingsPresent: string[]; bookingsFuture: string[];
  bookingCount: number; lifetimeValue: number;
  firstBookingAt?: string; lastBookingAt?: string;
  fyStats: FyStat[];
}

/* ---------- normalisers (import validation uses the same rules) ---------- */
export { cleanMobile, cleanEmail };

export function cleanDob(raw?: string): string | null | undefined {
  if (!raw?.trim()) return undefined;
  let s = raw.trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) s = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime()) || s > new Date().toISOString().slice(0, 10) || s < "1900-01-01") return null;
  return s;
}

/** Indian financial year of a yyyy-mm-dd / ISO date → "2026-27". */
export function fyOf(dateIso: string): string {
  const y = Number(dateIso.slice(0, 4)), m = Number(dateIso.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const currentFy = () => fyOf(new Date().toISOString());

/* ---------- storage (settings doc "clients", same pattern as agents) ---------- */
export async function loadClientRecords(): Promise<ClientRecord[]> {
  const sb = serviceClient();
  if (!sb) return [];
  const { data, error } = await sb.from("settings").select("doc").eq("id", "clients").maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.doc as { records?: ClientRecord[] })?.records ?? []);
}
export async function saveClientRecords(records: ClientRecord[]): Promise<void> {
  const sb = serviceClient()!;
  const { error } = await sb.from("settings").upsert({ id: "clients", doc: { records }, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/* ---------- derivation: records ∪ bookings → the living master ---------- */
const ACTIVE = ["accepted", "assigned", "picked_up", "in_transit"];

export function deriveClients(records: ClientRecord[], bookings: Booking[], now = Date.now()): ClientView[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const byMobile = new Map<string, ClientView>();

  const ensure = (mobile: string, seed?: Partial<ClientRecord>): ClientView => {
    let v = byMobile.get(mobile);
    if (!v) {
      v = {
        id: `CL-${mobile}`, name: seed?.name ?? "", mobile,
        source: seed?.source ?? "booking", createdAt: seed?.createdAt ?? new Date(now).toISOString(),
        ...seed,
        autoCategory: "New", effectiveCategory: "New",
        bookingsPast: [], bookingsPresent: [], bookingsFuture: [],
        bookingCount: 0, lifetimeValue: 0, fyStats: [],
      } as ClientView;
      byMobile.set(mobile, v);
    }
    return v;
  };

  /* saved master records first — their fields win */
  for (const r of records) {
    const m = cleanMobile(r.mobile);
    if (!m) continue;
    const v = ensure(m, r);
    Object.assign(v, r, { mobile: m, id: `CL-${m}` });
  }

  /* every booking links to its client; blanks fill from the booking */
  const fyMap = new Map<string, Map<string, FyStat>>();
  const wedding = new Set<string>(), b2b = new Set<string>();
  for (const b of bookings) {
    const m = cleanMobile(b.traveller.mobile);
    if (!m) continue;
    const v = ensure(m);
    if (!v.name && b.traveller.name) v.name = b.traveller.name;
    if (!v.email && b.traveller.email) v.email = cleanEmail(b.traveller.email) ?? undefined;
    if (!v.address && b.pickAddr) v.address = b.pickAddr;
    if (!v.city && b.from) v.city = b.from;

    const isActive = ACTIVE.includes(b.status);
    const isFuture = !!b.date && b.date > today && !["delivered", "cancelled", "rejected", "picked_up", "in_transit"].includes(b.status);
    if (isActive) v.bookingsPresent.push(b.id);
    else if (isFuture) v.bookingsFuture.push(b.id);
    else v.bookingsPast.push(b.id);

    v.bookingCount++;
    const value = paidAmount(b);
    v.lifetimeValue += value;
    if (!v.firstBookingAt || b.created < v.firstBookingAt) v.firstBookingAt = b.created;
    if (!v.lastBookingAt || b.created > v.lastBookingAt) v.lastBookingAt = b.created;

    const fy = fyOf(b.date || b.created);
    let fm = fyMap.get(m);
    if (!fm) { fm = new Map(); fyMap.set(m, fm); }
    const st = fm.get(fy) ?? { fy, bookings: 0, revenue: 0 };
    st.bookings++; st.revenue += value;
    fm.set(fy, st);

    if (b.uc === "wed" || b.eventCode) wedding.add(m);
    if ((b.admin as { agentId?: string }).agentId) b2b.add(m);
  }

  const nowFy = currentFy();
  for (const [m, v] of byMobile) {
    v.fyStats = [...(fyMap.get(m)?.values() ?? [])].sort((a, b) => b.fy.localeCompare(a.fy));
    const bookedThisFy = v.fyStats.some((s) => s.fy === nowFy && s.bookings > 0);
    v.autoCategory =
      b2b.has(m) ? "B2B" :
      wedding.has(m) ? "Wedding" :
      v.lifetimeValue >= 25000 ? "VIP" :
      v.bookingCount >= 2 ? "Repeat" :
      v.bookingCount >= 1 && !bookedThisFy ? "Dormant" : "New";
    v.effectiveCategory = v.category ?? v.autoCategory;
  }

  return [...byMobile.values()].sort((a, b) => (b.lastBookingAt ?? b.createdAt).localeCompare(a.lastBookingAt ?? a.createdAt));
}
