/** Server-side quote factory — one function that turns raw lead data into a
 *  booking with a SIGNED quote (or a rate-on-request booking when the route
 *  is not on the masters), identical in shape to what the manual quote desk
 *  and the website wizard produce. Used by the ads lead importer and the
 *  cadence engine's re-quotes. Server-only. */
import { quote, cityByName } from "./pricing";
import { loadMasters } from "./pricingSettings";
import { quotePayload, sign } from "./sign";
import { newToken } from "./supabaseAdmin";
import type { Booking, Mode, UseCase } from "./types";

export interface LeadInput {
  name: string; mobile: string; email?: string;
  fromName: string; toName: string;
  bags: number; oversize?: number; date?: string;
  source?: string; note?: string;
  /* full front-end parity (partner desk) — all optional, defaults as before */
  uc?: UseCase; ucName?: string; mode?: Mode;
  slot?: string; flight?: string; pickAddr?: string; dropAddr?: string;
}

export async function makeQuotedBooking(b: LeadInput): Promise<{ doc: Booking; ror: boolean; total: number }> {
  const bags = Math.max(1, Math.floor(b.bags || 2));
  const oversize = Math.max(0, Math.floor(b.oversize || 0));
  const mode: Mode = b.mode ?? "road";
  const masters = await loadMasters();
  const q = quote({ fromName: b.fromName, toName: b.toName, bags, oversize, mode, date: b.date }, masters);
  const ror = "error" in q;

  const id = newToken("BD");
  const nowIso = new Date().toISOString();
  const validUntil = new Date(Date.now() + 24 * 3600_000).toISOString();

  let signedQuote: Booking["quote"] = { qid: null, total: 0, breakdown: { ror: true } };
  if (!ror) {
    const qid = newToken("QT", 6);
    const signature = sign(quotePayload({ qid, fromName: b.fromName, toName: b.toName, bags, oversize, total: q.total, validUntil }));
    signedQuote = { qid, total: q.total, breakdown: q, validUntil, signature };
  }

  const fromCity = cityByName(b.fromName, masters.cities), toCity = cityByName(b.toName, masters.cities);
  const doc: Booking = {
    id, created: nowIso, status: "quoted",
    uc: b.uc ?? "d2d", ucName: b.ucName ?? "Door → Door", mode,
    from: b.fromName, to: b.toName, pickAddr: b.pickAddr?.trim() ?? "", dropAddr: b.dropAddr?.trim() ?? "",
    zo: fromCity?.zone ?? "", zd: toCity?.zone ?? "",
    date: b.date ?? "", ref: b.flight?.trim().toUpperCase() ?? "", slot: b.slot ?? "",
    bags, oversize, billed: ror ? bags + oversize : (signedQuote.breakdown.billed ?? bags),
    traveller: { name: b.name, mobile: b.mobile, email: b.email, res: "in" },
    payer: null, note: b.note ?? "", source: b.source ?? "ads-import",
    quote: signedQuote,
    /* Aadhaar UIDAI verification happens after payment and gates pickup */
    identity: { ok: false, at: "", method: "UIDAI Aadhaar OTP · pending (required before pickup)", score: 0 }, pay: null, admin: {},
    events: [{ at: nowIso, by: "admin", text: ror ? `Lead imported (${b.source ?? "ads"}) · RATE PENDING for ${b.fromName} → ${b.toName}` : `Lead imported (${b.source ?? "ads"}) · auto-quoted ${signedQuote.qid}` }],
  };
  return { doc, ror, total: signedQuote.total };
}

/** Re-sign an existing unpaid booking with a fresh 24h validity (cadence
 *  re-quote, or a pending-rate release once the route exists). */
export async function requoteBooking(b: Booking): Promise<{ doc: Booking; ror: boolean } | null> {
  const masters = await loadMasters();
  const q = quote({ fromName: b.from, toName: b.to, bags: b.bags, oversize: b.oversize, mode: b.mode, date: b.date || undefined }, masters);
  if ("error" in q) return null;
  const qid = b.quote.qid ?? newToken("QT", 6);
  const validUntil = new Date(Date.now() + 24 * 3600_000).toISOString();
  const signature = sign(quotePayload({ qid, fromName: b.from, toName: b.to, bags: b.bags, oversize: b.oversize, total: q.total, validUntil }));
  return {
    ror: false,
    doc: {
      ...b,
      quote: { qid, total: q.total, breakdown: q, validUntil, signature },
      events: [...b.events, { at: new Date().toISOString(), by: "admin", text: `Quote ${qid} issued · ${"₹" + q.total.toLocaleString("en-IN")} · valid 24h` }],
    },
  };
}
