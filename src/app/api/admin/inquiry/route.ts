import { NextResponse } from "next/server";
import { actorName, isAdminRequest } from "@/lib/adminAuth";
import { retryOnConflict, revOf, saveOrThrow } from "@/lib/bookingStore";
import { applyInquiryChanges, type InquiryChanges } from "@/lib/inquiryEdit";
import { loadMasters } from "@/lib/pricingSettings";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { Booking } from "@/lib/types";

/** Quote desk · "Save changes only" — staff correct an inquiry's details
 *  without telling the customer anything. Because no message goes out, the
 *  price may not move here: an edit that would re-price (route or bags) is
 *  refused with the new amount, and staff use Accept or Send revised price
 *  on the decision route instead, which carries the same changes. Needs Edit
 *  on Shipments (proxy.ts → access.ts ROUTE_MODULE). */

type Body = { id?: string; changes?: InquiryChanges; rev?: number };

async function handlePATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.changes || typeof b.changes !== "object") return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const doc = data.doc as Booking;
  if (typeof b.rev === "number" && revOf(doc) !== b.rev) return NextResponse.json({ error: "STALE", detail: "This inquiry changed since you opened it (the customer, finance or another team member updated it). Load the latest copy and try again." }, { status: 409 });

  const r = applyInquiryChanges(doc, b.changes, await loadMasters());
  if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.error === "LOCKED" ? 409 : 400 });
  if (r.priceChanged) {
    return NextResponse.json({
      error: "PRICE_WOULD_CHANGE",
      detail: `These changes change the price to ${r.next.quote.breakdown.ror ? "rate on request" : `₹${r.next.quote.total.toLocaleString("en-IN")}`} — use Accept or Send revised price so the customer is told.`,
      total: r.next.quote.breakdown.ror ? null : r.next.quote.total,
    }, { status: 409 });
  }
  if (!r.changed.length) return NextResponse.json({ ok: true, booking: doc, changed: [] });

  const next: Booking = { ...r.next, events: [...r.next.events, { at: new Date().toISOString(), by: "admin", text: `Details corrected by ${await actorName()} · ${r.changed.join("; ")}` }] };
  const up = await saveOrThrow(sb, next);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: next, changed: r.changed });
}

export const PATCH = retryOnConflict(handlePATCH);
