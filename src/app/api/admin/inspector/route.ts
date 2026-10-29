import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { inspect, journeys, type DeptContact } from "@/lib/inspector";
import { notify, kickSweep, loadDepartments } from "@/lib/automation";
import { cleanMobile, cleanEmail } from "@/lib/otp";
import type { Booking } from "@/lib/types";

/** Tracking Inspector API — computes SOP/SLA flags over the live bookings,
 *  manages the department contact registry (settings id "departments"),
 *  and dispatches a flagged problem to a department and/or a specific
 *  number (vendor, captain, client) as a WhatsApp + email pair, stamping
 *  the booking's event log. */

const loadDepts = loadDepartments;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const [{ data, error }, departments] = await Promise.all([
    sb.from("bookings").select("doc").order("created", { ascending: false }).limit(400),
    loadDepts(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const bookings = (data ?? []).map((r) => r.doc as Booking);
  const active = bookings.filter((b) => !["delivered", "cancelled", "rejected"].includes(b.status));
  const flags = inspect(bookings);
  /* which flags were already dispatched? the booking's events carry the stamp */
  const dispatched = new Set<string>();
  for (const b of bookings) for (const e of b.events) {
    const m = e.text.match(/^⚑ Flagged (\S+)/);
    if (m) dispatched.add(`${b.id}:${m[1]}`);
  }
  return NextResponse.json({
    watching: active.length,
    flags: flags.map((f) => ({ ...f, dispatched: dispatched.has(`${f.bookingId}:${f.rule}`) })),
    journeys: journeys(bookings, flags),
    departments,
  });
}

type Body =
  | { action: "saveDepts"; departments: DeptContact[] }
  | { action: "flag"; bookingId: string; rule: string; title: string; detail: string; deptKey?: string; extraMobile?: string; extraEmail?: string; note?: string };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  if (b.action === "saveDepts") {
    const departments = (b.departments ?? []).map((d) => ({
      key: d.key, name: d.name,
      mobile: d.mobile?.trim() ? cleanMobile(d.mobile) ?? undefined : undefined,
      email: d.email?.trim() ? cleanEmail(d.email) ?? undefined : undefined,
    }));
    const { error } = await sb.from("settings").upsert({ id: "departments", doc: { departments }, status: null, created: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, departments });
  }

  if (b.action === "flag") {
    const { data } = await sb.from("bookings").select("doc").eq("id", b.bookingId).maybeSingle();
    if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const doc = data.doc as Booking;
    const depts = await loadDepts();
    const dept = depts.find((d) => d.key === b.deptKey);
    const extraMobile = b.extraMobile?.trim() ? cleanMobile(b.extraMobile) : null;
    const extraEmail = b.extraEmail?.trim() ? cleanEmail(b.extraEmail) : null;
    if (!dept?.mobile && !dept?.email && !extraMobile && !extraEmail) {
      return NextResponse.json({ error: "NO_CONTACT", detail: "Give the department a contact (Inspector → Departments) or enter a number/email for this flag." }, { status: 400 });
    }

    const text = `⚑ BAGDROP OS flag · ${doc.id} · ${b.title}\n${b.detail}${b.note ? `\nNote: ${b.note}` : ""}\nLane: ${doc.from} → ${doc.to} · ${doc.date} ${doc.slot} · client ${doc.traveller.name} ${doc.traveller.mobile}\nAct and update the Inspector.`;
    const subject = `⚑ Flag · ${b.title} · ${doc.id}`;
    const ts = Date.now().toString(36);
    let queued = 0;
    if (dept && (dept.mobile || dept.email)) {
      queued += await notify("ops_alert", { name: dept.name, mobile: dept.mobile, email: dept.email }, { text, subject }, `flag:${doc.id}:${b.rule}:${dept.key}:${ts}`);
    }
    if (extraMobile || extraEmail) {
      queued += await notify("ops_alert", { name: "Assignee", mobile: extraMobile ?? undefined, email: extraEmail ?? undefined }, { text, subject }, `flag:${doc.id}:${b.rule}:extra:${ts}`);
    }

    const next: Booking = {
      ...doc,
      events: [...doc.events, {
        at: new Date().toISOString(), by: "admin",
        text: `⚑ Flagged ${b.rule} → ${dept?.name ?? "direct contact"}${extraMobile ? ` + ${extraMobile}` : ""}${b.note ? ` · ${b.note}` : ""}`,
      }],
    };
    const up = await sb.from("bookings").upsert({ id: next.id, doc: next, status: next.status, created: next.created });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    kickSweep();
    return NextResponse.json({ ok: true, queued });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
