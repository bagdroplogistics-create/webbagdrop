import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { quote, cityByName } from "@/lib/pricing";
import { quotePayload, sign } from "@/lib/sign";
import type { Booking, Mode, UseCase } from "@/lib/types";

/** Admin-made quote — for inquiries that reach the team by phone, WhatsApp,
 *  walk-in or a partner, rather than the self-serve website wizard. Same
 *  pricing engine, same signed-quote model, same `bookings` row shape — the
 *  resulting link (/q/{id}) is the exact page a website customer gets, and
 *  it shows up in both the Shipments inbox and here under "Open quotes"
 *  once it exists. */
interface QuoteRequest {
  title?: string; name: string; mobile: string; email?: string; res?: "in" | "intl";
  fromName: string; toName: string; pickAddr?: string; dropAddr?: string;
  uc?: UseCase; ucName?: string; mode?: Mode; date?: string; slot?: string; flight?: string;
  bags: number; oversize: number; note?: string; source?: string;
  validHours?: 24 | 48 | 168;
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: QuoteRequest;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.name || !b.mobile || !b.fromName || !b.toName) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const bags = Math.max(0, Math.floor(b.bags || 0));
  const oversize = Math.max(0, Math.floor(b.oversize || 0));
  const mode: Mode = b.mode ?? "road";
  const q = quote({ fromName: b.fromName, toName: b.toName, bags, oversize, mode, date: b.date });
  const ror = "error" in q;

  const id = newToken("BD");
  const nowIso = new Date().toISOString();
  const validHours = b.validHours ?? 24;
  const validUntil = new Date(Date.now() + validHours * 3600_000).toISOString();

  let signedQuote: Booking["quote"] = { qid: null, total: 0, breakdown: { ror: true } };
  if (!ror) {
    const qid = newToken("QT", 6);
    const signature = sign(quotePayload({
      qid, fromName: b.fromName, toName: b.toName, bags, oversize, total: q.total, validUntil,
    }));
    signedQuote = { qid, total: q.total, breakdown: q, validUntil, signature };
  }

  const fromCity = cityByName(b.fromName), toCity = cityByName(b.toName);
  const doc: Booking = {
    id, created: nowIso, status: "quoted",
    uc: b.uc ?? "", ucName: b.ucName ?? b.uc ?? "", mode,
    from: b.fromName, to: b.toName, pickAddr: b.pickAddr ?? "", dropAddr: b.dropAddr ?? "",
    zo: fromCity?.zone ?? "", zd: toCity?.zone ?? "",
    date: b.date ?? "", ref: (b.flight ?? "").toUpperCase(), slot: b.slot ?? "",
    bags, oversize, billed: ror ? Math.max(bags + oversize, 1) : q.billed,
    traveller: { title: b.title, name: b.name, mobile: b.mobile, email: b.email, res: b.res ?? "in" },
    payer: null, note: b.note ?? "", source: b.source ?? "team quote",
    quote: signedQuote,
    identity: null, pay: null, admin: {},
    events: [{ at: nowIso, by: "admin", text: `Quote created by the team · ${ror ? "rate on request" : `₹${q.total.toLocaleString("en-IN")} locked ${validHours}h`}` }],
  };

  const { error } = await sb.from("bookings").upsert({ id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: doc });
}
