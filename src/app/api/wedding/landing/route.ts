import { NextResponse } from "next/server";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { cleanMobile } from "@/lib/otp";
import { kickSweep, notifyInquiryDesk } from "@/lib/automation";
import type { BagdropEvent, Booking } from "@/lib/types";
import { DEMO_ALLOWED } from "@/lib/demoMode";

/** Wedding landing-page booking (/weddings?code=…), moved server-side.
 *  The browser sends only what the family typed; the event must be open,
 *  the sector, price, status, payment and identity are decided HERE. The
 *  page's Aadhaar code is checked server-side (demo code until the UIDAI /
 *  eSign provider is live) — the browser can no longer mark itself verified. */

const DEMO_OTP = process.env.AADHAAR_DEMO_OTP ?? "112233";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const eventCode = str(b.eventCode, 40);
  const family = str(b.family, 80), lead = str(b.lead, 80), city = str(b.city, 60), addr = str(b.addr, 200);
  const mobile = cleanMobile(str(b.mobile, 20));
  const bags = Math.min(20, Math.max(1, Math.floor(Number(b.bags) || 0)));
  if (!eventCode || !family || !lead || !city || !addr || !mobile) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  if (b.prohibited !== true || b.indemnity !== true) return NextResponse.json({ error: "DECLARATIONS_REQUIRED" }, { status: 400 });

  const { data: ev } = await sb.from("events").select("doc,status").eq("id", eventCode).maybeSingle();
  const EV = ev?.doc as BagdropEvent | undefined;
  if (!EV || (ev?.status ?? EV.status) !== "open") return NextResponse.json({ error: "EVENT_NOT_OPEN" }, { status: 403 });

  /* live deployments have no demo code: the booking is taken, and identity
   * stays pending for the bond + pickup gate instead of being self-certified */
  if (DEMO_ALLOWED && str(b.aadhaar, 6) !== DEMO_OTP) return NextResponse.json({ error: "WRONG_AADHAAR_OTP" }, { status: 401 });

  const s = (EV.sectors || []).find((x) => x.city === city);
  const minBags = (EV.rates || {}).minBags || 2;
  const total = s ? s.rate * Math.max(bags, minBags) * (EV.direction === "both" ? 2 : 1) : 0;
  const now = new Date().toISOString();
  const id = newToken("BD");
  const doc: Booking = {
    id, created: now, status: "submitted",
    eventCode: EV.id, eventName: EV.name,
    uc: "wed", ucName: "Wedding · " + ((EV.landing || {}).names || EV.name), mode: "road",
    from: city, to: EV.venueCity, pickAddr: addr, dropAddr: EV.venue || EV.venueCity,
    zo: "", zd: "", date: s ? s.pickDay : EV.dates.in, ref: EV.id, slot: "Wedding pickup day",
    bags, oversize: 0, billed: Math.max(bags, minBags),
    traveller: { name: lead, mobile, email: "", res: "in" },
    family: { name: family, side: str(b.side, 20) || undefined },
    payer: EV.billing === "host" ? { name: "Host account · " + EV.id, contact: (EV.contacts || {}).hostMobile || "" } : null,
    note: str(b.note, 300),
    quote: { qid: null, total, breakdown: { internal: true } as Booking["quote"]["breakdown"] },
    identity: DEMO_ALLOWED
      ? { ok: true, at: now, method: "Aadhaar OTP · wedding landing (demo, server-checked)", score: 0.95 }
      : { ok: false, at: "", method: "Pending — signs the bond before pickup", score: 0 },
    pay: null, admin: {},
    events: [{ at: now, by: "customer", text: "Family booked on the wedding landing page · " + EV.id + " · declarations accepted" }],
  };
  const up = await sb.from("bookings").insert({ id, doc, status: doc.status, created: now });
  if (up.error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  await notifyInquiryDesk(`💍 New wedding booking · ${id} · ${family} (${lead}, +${mobile}) · ${bags} bags from ${city} · event ${EV.id}`, `Wedding booking · ${id} · ${EV.id}`, `inq:${id}`);
  kickSweep();
  return NextResponse.json({ ok: true, id, pickDay: s ? s.pickDay : EV.dates.in, retDay: s ? s.retDay : EV.dates.out });
}
