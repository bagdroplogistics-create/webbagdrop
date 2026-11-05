import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { issueTags, setStickers } from "@/lib/tagIssue";
import { labelsHtml, labelsZpl, tagCtx, LABEL_KINDS, MEDIA, type LabelKind, type Media } from "@/lib/labels";
import { opsOf } from "@/lib/opsModel";
import type { UserSticker } from "@/lib/bagTags";
import { PHOTO_BUCKET } from "@/lib/fieldOps";
import { passPath } from "@/lib/trackLinks";
import { isTrackable } from "@/lib/tracking";
import type { Booking } from "@/lib/types";

/** BAGDROP OS · bag tags.
 *   POST {action:"issue", id}                 plates + seals for every piece
 *   POST {action:"stickers", id, n, stickers} FRAGILE / PRIORITY / UP on a bag
 *   GET  ?id=&info=1 → Move Pass link + check-in photo/signature links (1 h)
 *   GET  ?id=&kind=loop|backup|stickers|seals|all&media=loopstock|4x6|a4[&n=3][&format=zpl]
 *        → print-ready HTML (or Zebra ZPL) for the booking's issued tags */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { action?: string; id?: string; n?: number; stickers?: UserSticker[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  if (b.action === "issue") {
    const r = await issueTags(sb, b.id, "BAGDROP OS");
    if ("error" in r) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
    return NextResponse.json({ ok: true, issued: r.issued, booking: r.booking });
  }
  if (b.action === "stickers") {
    const next = await setStickers(sb, b.id, Number(b.n), b.stickers ?? []);
    if (!next) return NextResponse.json({ error: "NOT_SAVED", detail: "Issue the tags first, then choose stickers." }, { status: 409 });
    return NextResponse.json({ ok: true, booking: next });
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}

export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  /* ?info=1 → the Move Pass / tracking links + 1-hour links to check-in photos and the signature */
  if (u.searchParams.get("info") === "1") {
    const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
    const bk = data?.doc as Booking | undefined;
    if (!bk) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const o = opsOf(bk);
    const paths = [...(o.bags ?? []).map((x) => x.photo).filter(Boolean), o.checkin?.signature, bk.pod?.photo, bk.pod?.signature].filter(Boolean) as string[];
    const signed = paths.length ? (await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
    const url = (p?: string) => (p ? signed.find((s) => s.path === p)?.signedUrl ?? null : null);
    return NextResponse.json({
      passUrl: isTrackable(bk) ? passPath(bk.id) : null,
      photos: Object.fromEntries((o.bags ?? []).map((x) => [x.n, url(x.photo)])),
      signature: url(o.checkin?.signature),
      podPhoto: url(bk.pod?.photo), podSignature: url(bk.pod?.signature),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  const kind = (u.searchParams.get("kind") ?? "all") as LabelKind;
  const media = (u.searchParams.get("media") ?? "4x6") as Media;
  const zpl = u.searchParams.get("format") === "zpl";
  const only = Number(u.searchParams.get("n")) || null;
  if (!LABEL_KINDS.includes(kind) || !MEDIA.includes(media)) return NextResponse.json({ error: "BAD_KIND_OR_MEDIA" }, { status: 400 });
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const booking = data?.doc as Booking | undefined;
  if (!booking) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const bags = (opsOf(booking).bags ?? []).filter((x) => !only || x.n === only);
  if (!bags.length) return NextResponse.json({ error: "NO_TAGS", detail: "Issue the tags first." }, { status: 409 });
  const site = (process.env.SITE_URL || u.origin).replace(/\/$/, "");
  const ctx = tagCtx(booking, site);
  try {
    if (zpl) {
      return new NextResponse(labelsZpl(kind, media, ctx, bags), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${booking.id}-${kind}-${media}.zpl"`, "Cache-Control": "no-store" },
      });
    }
    return new NextResponse(labelsHtml(kind, media, ctx, bags, { autoPrint: u.searchParams.get("print") === "1" }), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "PRINT_FAILED";
    const detail = code === "LOOPSTOCK_IS_FOR_LOOP_TAGS" ? "Loop-tag stock takes loop tags only — print backup labels, stickers and seals on 4×6 or A4."
      : code === "ZPL_IS_FOR_THERMAL" ? "ZPL is for Zebra printers (4×6 or loop-tag stock). A4 and Brother QL-800 print straight from the browser." : code;
    return NextResponse.json({ error: code, detail }, { status: 400 });
  }
}
