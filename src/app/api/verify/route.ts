import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { notify, kickSweep } from "@/lib/automation";
import type { Booking } from "@/lib/types";

/** Post-payment Aadhaar verification (UIDAI OTP via DigiLocker). The booking
 *  already exists and is paid; this endpoint flips identity.ok, which is what
 *  the admin API's pickup gate checks — no verified identity, no pickup.
 *  Only the one booking whose id is presented can be read or updated, and the
 *  response carries a minimal, masked view (no full contact details).
 *
 *  UIDAI/DigiLocker production keys are not wired yet: until they are, the
 *  OTP accepted is AADHAAR_DEMO_OTP (default 112233), clearly labelled demo. */

const DEMO_OTP = process.env.AADHAAR_DEMO_OTP ?? "112233";
const MAX_ATTEMPTS = 2;

const mask = (s?: string) => (s ? s.replace(/.(?=.{3})/g, "•") : "");

function summary(b: Booking) {
  return {
    id: b.id, status: b.status, from: b.from, to: b.to, date: b.date, slot: b.slot,
    bags: b.bags, oversize: b.oversize,
    name: b.traveller.name, mobile: mask(b.traveller.mobile),
    paid: b.pay?.status === "captured", ror: !!b.quote.breakdown.ror,
    verified: !!b.identity?.ok, verifiedAt: b.identity?.ok ? b.identity.at : null,
  };
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ booking: summary(data.doc as Booking) });
}

export async function POST(req: Request) {
  let b: { id?: string; otp?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.otp) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc = data.doc as Booking;
  if (doc.identity?.ok) return NextResponse.json({ ok: true, booking: summary(doc) }); // idempotent

  const admin = doc.admin as { aadhaarAttempts?: number; aadhaarLocked?: boolean };
  if (admin.aadhaarLocked) return NextResponse.json({ error: "LOCKED" }, { status: 423 });

  if (b.otp.trim() !== DEMO_OTP) {
    const attempts = (admin.aadhaarAttempts ?? 0) + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    const now = new Date().toISOString();
    const failed: Booking = {
      ...doc,
      admin: { ...doc.admin, aadhaarAttempts: attempts, ...(locked ? { aadhaarLocked: true } : {}) },
      events: locked ? [...doc.events, { at: now, by: "customer", text: `Aadhaar verification locked after ${MAX_ATTEMPTS} failed attempts — flagged for manual review` }] : doc.events,
    };
    await sb.from("bookings").upsert({ id: failed.id, doc: failed, status: failed.status, created: failed.created });
    return NextResponse.json({ error: locked ? "LOCKED" : "WRONG_OTP" }, { status: locked ? 423 : 401 });
  }

  const now = new Date().toISOString();
  const next: Booking = {
    ...doc,
    identity: { ok: true, at: now, method: "UIDAI Aadhaar OTP · DigiLocker (demo)", score: 0.97 },
    events: [...doc.events, { at: now, by: "customer", text: "Identity verified · UIDAI Aadhaar OTP (post-payment, pre-pickup)" }],
  };
  const up = await sb.from("bookings").upsert({ id: next.id, doc: next, status: next.status, created: next.created });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  await notify("identity_done",
    { name: doc.traveller.name, mobile: doc.traveller.mobile, email: doc.traveller.email },
    { ref: doc.id, date: doc.date, lane: `${doc.from} → ${doc.to}` }, `idok:${doc.id}`);
  kickSweep();
  return NextResponse.json({ ok: true, booking: summary(next) });
}
