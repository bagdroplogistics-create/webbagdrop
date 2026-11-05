import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { opsOf, type LegKey } from "@/lib/opsModel";
import { isTrackable } from "@/lib/tracking";
import type { Booking } from "@/lib/types";
import { fieldAction, fieldPhoto, stateOf, type FieldBody } from "@/lib/fieldAction";

/** The Operations desk runs the captain's pickup check-in and delivery
 *  claim check itself — same rules and proof as the driver app
 *  (src/lib/fieldAction.ts), every entry marked "entered by ops".
 *  GET ?id&leg → state · POST JSON {id, leg, action, …} · POST multipart
 *  {id, leg, photo, n | kind=pod}. */
const LEGS: LegKey[] = ["pickup", "lastmile"];

async function load(id: string, leg: string) {
  const sb = serviceClient();
  if (!sb || !LEGS.includes(leg as LegKey)) return null;
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b || !isTrackable(b)) return null;
  const assignee = opsOf(b).legs?.[leg as LegKey]?.assignee;
  return { sb, b, leg: leg as LegKey, captain: assignee ?? "ops desk" };
}
const notReady = () => NextResponse.json({ error: "NOT_READY", detail: "This booking isn't confirmed and paid yet, so its bags can't be handled." }, { status: 409 });

export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const u = new URL(req.url);
  const j = await load(u.searchParams.get("id") ?? "", u.searchParams.get("leg") ?? "");
  if (!j) return notReady();
  return NextResponse.json({ leg: j.leg, state: stateOf(j.b) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const j = form ? await load(String(form.get("id") ?? ""), String(form.get("leg") ?? "")) : null;
    if (!j || !form) return notReady();
    return fieldPhoto(j.sb, j.b, j.leg, form);
  }
  let body: FieldBody & { id?: string; leg?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const j = await load(body.id ?? "", body.leg ?? "");
  if (!j) return notReady();
  return fieldAction(j.sb, j.b, j.leg, j.captain, body, "ops");
}
