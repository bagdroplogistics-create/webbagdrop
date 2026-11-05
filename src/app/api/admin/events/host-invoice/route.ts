import { NextResponse } from "next/server";
import { isAdminRequest, actorName } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { financialYear } from "@/lib/docs";
import type { Booking, HostInvoiceLine, WeddingEvent } from "@/lib/types";

/** Generates the FINAL host invoice for a host-billed wedding/event
 *  (WeddingEvent.billing === "host") — the one piece the 2026-11-05
 *  wedding-tutorial cross-check found missing: the Commercials panel only
 *  ever showed a forward-looking *estimate* (avg sector rate × expected
 *  bags); nothing turned the real post-event numbers into an actual
 *  issued document. This is a deliberate admin action (not automatic like
 *  LR-on-payment), since "the hosts' bill" is meant to be struck once,
 *  after the event, from final numbers — see Weddings.tsx's "Generate
 *  final host invoice" button.
 *
 *  Reuses the exact same race-safe next_doc_no("INV", fy) numbering every
 *  other Finance document uses (see finance/doc/route.ts) — no second
 *  invoicing mechanism. Billed to the event, not to any one family's own
 *  booking, so it's recorded on the event's own .docs/.hostInvoice, not on
 *  a booking. */

function sectorRate(ev: WeddingEvent, city: string): number {
  const sectors = ev.sectors ?? [];
  const match = sectors.find((s) => s.city.trim().toLowerCase() === city.trim().toLowerCase());
  if (match) return match.rate;
  // No sector configured for this family's pickup city — fall back to the
  // same average-of-all-sectors the live Commercials estimate already uses,
  // rather than refusing or silently billing ₹0.
  return sectors.length ? sectors.reduce((a, s) => a + (s.rate || 0), 0) / sectors.length : 0;
}

async function handlePOST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let body: { eventId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.eventId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: evRow, error: evErr } = await sb.from("events").select("doc").eq("id", body.eventId).maybeSingle();
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });
  if (!evRow) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  const event = evRow.doc as WeddingEvent;

  if (event.billing !== "host") return NextResponse.json({ error: "NOT_HOST_BILLED", detail: "This event bills the families directly, not the host — there's nothing to invoice the host for." }, { status: 400 });
  if (event.hostInvoice) return NextResponse.json({ error: "ALREADY_INVOICED", detail: `Already invoiced as ${event.hostInvoice.no} on ${event.hostInvoice.at}.`, hostInvoice: event.hostInvoice }, { status: 409 });

  const { data: famRows, error: famErr } = await sb.from("bookings").select("doc").eq("doc->>eventCode", event.id).limit(1000);
  if (famErr) return NextResponse.json({ error: famErr.message }, { status: 500 });
  const families = (famRows ?? [])
    .map((r) => r.doc as Booking)
    .filter((b) => b.uc === "wed" && b.status !== "cancelled" && b.status !== "rejected");

  if (families.length === 0) return NextResponse.json({ error: "NO_FAMILIES", detail: "No confirmed families under this event yet — nothing to bill." }, { status: 400 });

  const minBags = event.rates?.minBags || 0;
  const oversizeRate = event.rates?.oversize || 0;
  const lines: HostInvoiceLine[] = families.map((b) => {
    const rate = sectorRate(event, b.from);
    const billedBags = Math.max(b.bags, minBags);
    const amount = billedBags * rate + (b.oversize || 0) * oversizeRate;
    return { bookingId: b.id, family: b.family?.name ?? b.traveller.name, bags: b.bags, billedBags, oversize: b.oversize || 0, rate, amount: Math.round(amount) };
  });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const discountPct = event.rates?.slabPct || 0;
  const discount = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discount;

  const { data: no, error: noErr } = await sb.rpc("next_doc_no", { p_type: "INV", p_fy: financialYear() });
  if (noErr) return NextResponse.json({ error: noErr.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  const by = await actorName();
  const hostInvoice = { no: String(no), at: nowIso, by, lines, subtotal, discountPct, discount, total };
  const updated: WeddingEvent = {
    ...event,
    docs: [...(event.docs ?? []), { type: "INV" as const, no: String(no), at: nowIso, amount: total }],
    hostInvoice,
  };
  const { error } = await sb.from("events").upsert({ id: updated.id, doc: updated, status: updated.status, created: updated.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: updated, hostInvoice });
}

export const POST = handlePOST;
