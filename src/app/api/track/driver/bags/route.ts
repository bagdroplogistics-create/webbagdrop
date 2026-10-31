import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { readDriverToken } from "@/lib/trackLinks";
import { opsOf } from "@/lib/opsModel";
import { spaced } from "@/lib/bagTags";
import { issueTags } from "@/lib/tagIssue";
import { labelsHtml, labelsZpl, tagCtx, LABEL_KINDS, MEDIA, type LabelKind, type Media } from "@/lib/labels";
import { checkInBag, claimBag, claimPass, completeDelivery, completePickup, newDeliveryOtp, savePhoto, type FieldResult } from "@/lib/fieldOps";
import { notify, kickSweep } from "@/lib/automation";
import { isTrackable } from "@/lib/tracking";
import type { Booking } from "@/lib/types";

/** The captain's bag flows on the driver page (/d/<token>).
 *  Pickup leg:   GET state · issue (missing tags) · checkin · photo (multipart) · complete
 *                GET ?labels=1&kind&media[&format=zpl] → print on the captain's portable printer
 *  Last-mile leg: GET state · pass · bag · otp · deliver
 *  A token only ever acts on its own booking and its own leg. */
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
const reply = (r: FieldResult, extra: Record<string, unknown> = {}) =>
  r.ok ? NextResponse.json({ ok: true, ...extra, state: stateOf(r.booking) }) : NextResponse.json({ error: r.error, detail: r.detail }, { status: 409 });

function stateOf(b: Booking) {
  const o = opsOf(b);
  const c = o.claim ?? {};
  return {
    pieces: b.bags + b.oversize, xl: b.oversize,
    identityOk: !!b.identity?.ok, lrIssued: !!o.milestones?.lr, picked: !!o.milestones?.picked,
    arrived: !!o.milestones?.arrive, delivered: !!o.milestones?.pod,
    bags: (o.bags ?? []).map((x) => ({
      n: x.n, plate: spaced(x.plate), xl: x.xl, seal: x.seal ? spaced(x.seal) : null,
      weightKg: x.weightKg ?? null, photo: !!x.photo, checkedIn: !!x.checkedInAt,
      claimed: (c.scanned ?? []).includes(x.plate),
    })),
    claim: { passScanned: !!c.passAt, otpSentAt: c.otpAt ?? null },
  };
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
    if (!j) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
    if (j.leg !== "pickup") return NextResponse.json({ error: "PICKUP_ONLY" }, { status: 403 });
    const file = form?.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "NO_PHOTO" }, { status: 400 });
    return reply(await savePhoto(j.sb, j.b.id, Number(form?.get("n")), file));
  }
  let body: { t?: string; action?: string; n?: number; tag?: string; seal?: string; weightKg?: number; heavyOk?: boolean; signature?: string; scan?: string; otp?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const j = await load(body.t ?? "");
  if (!j) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  const { sb, b, leg, captain } = j;
  const pickupActions = ["issue", "checkin", "complete"], deliveryActions = ["pass", "bag", "otp", "deliver"];
  if (pickupActions.includes(body.action ?? "") && leg !== "pickup") return NextResponse.json({ error: "PICKUP_ONLY" }, { status: 403 });
  if (deliveryActions.includes(body.action ?? "") && leg !== "lastmile") return NextResponse.json({ error: "DELIVERY_ONLY" }, { status: 403 });

  switch (body.action) {
    case "issue": {
      const r = await issueTags(sb, b.id, `captain ${captain}`);
      if ("error" in r) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
      return NextResponse.json({ ok: true, issued: r.issued, state: stateOf(r.booking) });
    }
    case "checkin": return reply(await checkInBag(sb, b.id, captain, { n: Number(body.n), tag: body.tag ?? "", seal: body.seal ?? "", weightKg: Number(body.weightKg), heavyOk: !!body.heavyOk }));
    case "complete": { const r = await completePickup(sb, b.id, captain, body.signature ?? ""); if (r.ok) kickSweep(); return reply(r); }
    case "pass": return reply(await claimPass(sb, b.id, body.scan ?? ""));
    case "bag": return reply(await claimBag(sb, b.id, body.scan ?? ""));
    case "otp": {
      const r = await newDeliveryOtp(sb, b.id);
      if (!r.ok || !r.otp) return reply(r);
      const sent = await notify("delivery_otp", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email },
        { ref: b.id, otp: r.otp, captain }, `otp:${b.id}:${Date.now()}`).catch(() => 0);
      kickSweep();
      return reply(r, { sent: sent > 0 });
    }
    case "deliver": { const r = await completeDelivery(sb, b.id, captain, body.otp ?? ""); if (r.ok) kickSweep(); return reply(r); }
    default: return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  }
}
