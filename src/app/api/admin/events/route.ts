import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { WeddingEvent } from "@/lib/types";

/** Events table already exists in schema.sql (same generic id/doc/status/
 *  created shape as bookings/trips/etc.) — no migration needed. Event codes
 *  ("WED-XXXXX") are generated the same unguessable way as booking ids. */
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function eventCode(type: string): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `${type || "WED"}-${s}`;
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("events").select("doc").order("created", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: (data ?? []).map((r) => r.doc as WeddingEvent) });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let body: { doc?: WeddingEvent } & Partial<Omit<WeddingEvent, "id" | "created" | "status">>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  /** The app's actual, only caller (src/lib/eventsApi.ts: adminSaveEvent())
   *  always sends a full event doc under { doc }, with its own id already
   *  minted client-side (newEventCode()) for a create, or the existing
   *  event's id for an edit — this branch is what every real create/edit
   *  in Weddings.tsx (new event, Commercials, TeamSetting, booking-closes
   *  date, host-invoice writes) goes through. Merge onto whatever is
   *  already saved under that id, so two edits to different fields can't
   *  silently clobber each other. */
  if (body.doc) {
    const doc = body.doc;
    if (!doc.id || !doc.name || !doc.venueCity) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const { data: existing, error: getErr } = await sb.from("events").select("doc").eq("id", doc.id).maybeSingle();
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
    const merged: WeddingEvent = existing ? { ...(existing.doc as WeddingEvent), ...doc } : { ...doc, created: doc.created || new Date().toISOString(), status: doc.status || "open" };
    const { error } = await sb.from("events").upsert({ id: merged.id, doc: merged, status: merged.status, created: merged.created });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, event: merged });
  }

  // Legacy flat-fields create shape — kept for compatibility, but no
  // current caller in this app uses it (eventsApi.ts's createEvent() is
  // unused dead code; everything goes through adminSaveEvent() above).
  const b = body as Omit<WeddingEvent, "id" | "created" | "status">;
  if (!b.name || !b.venueCity) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  const id = eventCode(b.type);
  const doc: WeddingEvent = { ...b, id, created: new Date().toISOString(), status: "open" };
  const { error } = await sb.from("events").upsert({ id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: doc });
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { id?: string; patch?: Partial<WeddingEvent> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.patch) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: cur, error: getErr } = await sb.from("events").select("doc").eq("id", b.id).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc: WeddingEvent = { ...(cur.doc as WeddingEvent), ...b.patch };
  const { error } = await sb.from("events").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: doc });
}
