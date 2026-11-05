import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { readDriverToken } from "@/lib/trackLinks";
import { opsOf } from "@/lib/opsModel";
import { labelsHtml, labelsZpl, tagCtx, LABEL_KINDS, MEDIA, type LabelKind, type Media } from "@/lib/labels";
import { isTrackable } from "@/lib/tracking";
import type { Booking } from "@/lib/types";
import { fieldAction, fieldPhoto, stateOf, type FieldBody } from "@/lib/fieldAction";

/** The captain's bag flows on the driver page (/d/<token>).
 *  Pickup leg:   GET state · issue (missing tags) · checkin · photo (multipart) · complete
 *                GET ?labels=1&kind&media[&format=zpl] → print on the captain's portable printer
 *  Last-mile leg: GET state · pass · bag · otp · pod photo (multipart, kind=pod) · deliver
 *  A token only ever acts on its own booking and its own leg. The actions
 *  themselves live in src/lib/fieldAction.ts (shared with the ops desk). */
async function load(token: string) {
  const d = readDriverToken(token);
  if (!d) return null;
  const sb = serviceClient();
  if (!sb) return null;
  const { data } = await sb.from("bookings").select("doc").eq("id", d.id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b || !isTrackable(b)) return null;
  return { sb, b, leg: d.leg, captain: opsOf(b).legs?.[d.leg]?.assignee ?? `${d.leg} captain` };
}
export async function GET(req: Request) {
  const u = new URL(req.url);
  const j = await load(u.searchParams.get("t") ?? "");
  if (!j) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  if (u.searchParams.get("labels") === "1") {
    if (j.leg !== "pickup") return NextResponse.json({ error: "PICKUP_ONLY" }, { status: 403 });
    const kind = (u.searchParams.get("kind") ?? "all") as LabelKind;
    const media = (u.searchParams.get("media") ?? "4x6") as Media;
    if (!LABEL_KINDS.includes(kind) || !MEDIA.includes(media)) return NextResponse.json({ error: "BAD_KIND_OR_MEDIA" }, { status: 400 });
    const bags = opsOf(j.b).bags ?? [];
    if (!bags.length) return NextResponse.json({ error: "NO_TAGS", detail: "No tags issued yet." }, { status: 409 });
    const ctx = tagCtx(j.b, (process.env.SITE_URL || u.origin).replace(/\/$/, ""));
    try {
      if (u.searchParams.get("format") === "zpl") return new NextResponse(labelsZpl(kind, media, ctx, bags), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${j.b.id}-${kind}.zpl"` } });
      return new NextResponse(labelsHtml(kind, media, ctx, bags, { autoPrint: true }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "PRINT_FAILED" }, { status: 400 }); }
  }
  return NextResponse.json({ leg: j.leg, state: stateOf(j.b) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  /* photos arrive as multipart; everything else as JSON */
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const j = await load(String(form?.get("t") ?? ""));
    if (!j || !form) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
    return fieldPhoto(j.sb, j.b, j.leg, form);
  }
  let body: FieldBody & { t?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const j = await load(body.t ?? "");
  if (!j) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  return fieldAction(j.sb, j.b, j.leg, j.captain, body, "captain");
}
