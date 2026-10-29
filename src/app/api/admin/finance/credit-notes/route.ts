import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { financialYear } from "@/lib/docs";
import type { Booking } from "@/lib/types";

/** Credit notes — Zoho-Books-style, with an EXPIRY DATE. Issued against a
 *  booking/customer, numbered race-safe (CN series), stored in the settings
 *  doc "creditnotes"; also logged on the booking's docs[] so the printable
 *  CN opens from the booking. The sweep expires them automatically. */

export interface CreditNote {
  id: string;             // CN/FY/0001
  bookingId?: string;
  customer: string; mobile?: string;
  amount: number;
  reason: string;
  issuedAt: string;
  expiresAt: string;      // yyyy-mm-dd — unusable after this date
  status: "active" | "applied" | "expired" | "void";
  appliedAt?: string; appliedNote?: string;
}

async function load(sb: NonNullable<ReturnType<typeof serviceClient>>): Promise<CreditNote[]> {
  const { data } = await sb.from("settings").select("doc").eq("id", "creditnotes").maybeSingle();
  return ((data?.doc as { notes?: CreditNote[] })?.notes ?? []);
}
async function save(sb: NonNullable<ReturnType<typeof serviceClient>>, notes: CreditNote[]) {
  const { error } = await sb.from("settings").upsert({ id: "creditnotes", doc: { notes }, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const notes = await load(sb);
  const today = new Date().toISOString().slice(0, 10);
  /* live expiry view even between sweeps */
  for (const n of notes) if (n.status === "active" && n.expiresAt < today) n.status = "expired";
  return NextResponse.json({ notes: notes.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)) });
}

type Body =
  | { action: "issue"; bookingId?: string; customer: string; mobile?: string; amount: number; reason: string; expiresAt: string }
  | { action: "apply"; id: string; note?: string }
  | { action: "void"; id: string };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const notes = await load(sb);

  if (b.action === "issue") {
    const amount = Math.round(Number(b.amount) || 0);
    if (!b.customer?.trim() || amount <= 0) return NextResponse.json({ error: "MISSING_FIELDS", detail: "Customer and a positive amount are required." }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    if (!b.expiresAt || b.expiresAt <= today) return NextResponse.json({ error: "BAD_EXPIRY", detail: "Expiry must be a future date." }, { status: 400 });
    const { data: no, error } = await sb.rpc("next_doc_no", { p_type: "CN", p_fy: financialYear() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const note: CreditNote = {
      id: String(no), bookingId: b.bookingId || undefined,
      customer: b.customer.trim(), mobile: b.mobile?.trim() || undefined,
      amount, reason: b.reason?.trim() || "", issuedAt: new Date().toISOString(),
      expiresAt: b.expiresAt, status: "active",
    };
    await save(sb, [...notes, note]);
    /* mirror onto the booking's document trail for the printable CN */
    if (note.bookingId) {
      const { data: row } = await sb.from("bookings").select("doc").eq("id", note.bookingId).maybeSingle();
      if (row) {
        const doc = row.doc as Booking;
        const next: Booking = {
          ...doc,
          docs: [...(doc.docs ?? []), { type: "CN", no: note.id, at: note.issuedAt, amount }],
          events: [...doc.events, { at: note.issuedAt, by: "admin", text: `Credit note ${note.id} issued · ₹${amount.toLocaleString("en-IN")} · ${note.reason || "no reason recorded"} · valid until ${note.expiresAt}` }],
        };
        await sb.from("bookings").upsert({ id: next.id, doc: next, status: next.status, created: next.created });
      }
    }
    return NextResponse.json({ ok: true, note });
  }

  const n = notes.find((x) => x.id === (b as { id: string }).id);
  if (!n) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (b.action === "apply") {
    if (n.status !== "active") return NextResponse.json({ error: "NOT_ACTIVE", detail: `Credit note is ${n.status} — only active notes can be applied.` }, { status: 409 });
    const today = new Date().toISOString().slice(0, 10);
    if (n.expiresAt < today) { n.status = "expired"; await save(sb, notes); return NextResponse.json({ error: "EXPIRED", detail: `Expired on ${n.expiresAt}.` }, { status: 409 }); }
    n.status = "applied"; n.appliedAt = new Date().toISOString(); n.appliedNote = b.note;
    await save(sb, notes);
    return NextResponse.json({ ok: true, note: n });
  }
  if (b.action === "void") {
    if (n.status === "applied") return NextResponse.json({ error: "ALREADY_APPLIED" }, { status: 409 });
    n.status = "void";
    await save(sb, notes);
    return NextResponse.json({ ok: true, note: n });
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
