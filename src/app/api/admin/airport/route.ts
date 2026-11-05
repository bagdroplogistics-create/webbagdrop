import { NextResponse } from "next/server";
import { actorName, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { kickSweep } from "@/lib/automation";
import {
  custodyReportHtml, enrol, handoverHandler, handoverPax, holdIn, holdOut, linkAirlineTag, loadPocConfig, logException,
  resolveException, retryBagJourney, savePocConfig, setFlight, t2Scan, voidAirlineTag, type DeskResult,
} from "@/lib/airportServer";
import { applyTagPrinted, bagJourneyPass, handleInbound } from "@/lib/bagJourney";
import type { FlightBlock, Lane } from "@/lib/airportPoc";
import type { Booking } from "@/lib/types";

/** BAGDROP OS · Airport desk (SITA × Bagdrop, Mumbai T2 POC).
 *   GET                       → config + Bag Journey stand-in log, unmatched Flexbox prints, SITA devices
 *   GET ?report=<id>          → printable chain-of-custody report (HTML)
 *   POST {action, id, …}      → saveConfig · enrol · flight · linkTag · voidTag · holdIn · holdOut · t2Scan ·
 *                               handoverPax · handoverHandler · exception · resolve · retryBj · sendBj ·
 *                               simulate (a SITA event through the real inbound handler) · matchOrphan */
export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const cfg = await loadPocConfig(sb);
  const report = new URL(req.url).searchParams.get("report");
  if (report) {
    const { data } = await sb.from("bookings").select("doc").eq("id", report).maybeSingle();
    if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return new NextResponse(custodyReportHtml(data.doc as Booking, cfg), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const [si, orphans, devices] = await Promise.all([
    sb.from("settings").select("doc").eq("status", "bjstandin").order("created", { ascending: false }).limit(40),
    sb.from("settings").select("id, doc").eq("status", "bjorphan").order("created", { ascending: false }).limit(50),
    sb.from("settings").select("doc").eq("status", "sitadevice").limit(50),
  ]);
  return NextResponse.json({
    config: cfg,
    liveConfigured: !!(process.env.BAG_JOURNEY_URL && process.env.BAG_JOURNEY_TOKEN),
    standin: (si.data ?? []).map((r) => r.doc),
    orphans: (orphans.data ?? []).map((r) => ({ id: r.id, ...(r.doc as object) })),
    devices: (devices.data ?? []).map((r) => r.doc),
  }, { headers: { "Cache-Control": "no-store" } });
}

type Body = {
  action?: string; id?: string; config?: unknown; lane?: Lane; flight?: Partial<FlightBlock>; n?: number; scan?: string; place?: string; weightKg?: number;
  lp?: string; reason?: string; spot?: string; boardingPass?: string; override?: string; receiver?: string; handlerId?: string;
  kind?: string; note?: string; excId?: string; resolution?: string; event?: unknown; orphanId?: string;
};

const reply = (r: DeskResult) => r.ok
  ? NextResponse.json({ ok: true, booking: r.booking, ...(r.note ? { note: r.note } : {}) })
  : NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status ?? 409 });

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const by = await actorName();

  switch (b.action) {
    case "saveConfig": {
      try { return NextResponse.json({ ok: true, config: await savePocConfig(sb, b.config, by) }); }
      catch (e) { return NextResponse.json({ error: "SAVE_FAILED", detail: e instanceof Error ? e.message : "" }, { status: 500 }); }
    }
    case "sendBj": return NextResponse.json({ ok: true, ...(await bagJourneyPass(sb)) });
    case "simulate": {
      const r = await handleInbound(sb, b.event);
      return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error, detail: r.detail }, { status: 400 });
    }
    case "matchOrphan": {
      if (!b.orphanId?.startsWith("bjorphan:") || !b.id) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
      const { data } = await sb.from("settings").select("doc").eq("id", b.orphanId).maybeSingle();
      const o = data?.doc as { lp: string; at: string; weightKg?: number; photoUrl?: string; device?: string } | undefined;
      if (!o) return NextResponse.json({ error: "NOT_FOUND", detail: "That Flexbox print was already matched." }, { status: 404 });
      const r = await applyTagPrinted(sb, b.id, o);
      if (!r.ok) return NextResponse.json({ error: r.error, detail: r.detail }, { status: 409 });
      await sb.from("settings").delete().eq("id", b.orphanId);
      kickSweep();
      return NextResponse.json({ ok: true });
    }
  }
  if (!b.id) return NextResponse.json({ error: "MISSING_FIELDS", detail: "Which booking?" }, { status: 400 });
  const id = b.id;
  let r: DeskResult;
  switch (b.action) {
    case "enrol": r = await enrol(sb, id, b.lane as Lane, by); break;
    case "flight": r = await setFlight(sb, id, b.flight ?? {}, by); break;
    case "linkTag": r = await linkAirlineTag(sb, id, { n: Number(b.n), scan: b.scan ?? "", place: b.place, weightKg: b.weightKg }, by); break;
    case "voidTag": r = await voidAirlineTag(sb, id, String(b.lp ?? ""), b.reason ?? "", by); break;
    case "holdIn": r = await holdIn(sb, id, b.spot ?? "", by); break;
    case "holdOut": r = await holdOut(sb, id, by); break;
    case "t2Scan": r = await t2Scan(sb, id, b.scan ?? "", by); break;
    case "handoverPax": r = await handoverPax(sb, id, { boardingPass: b.boardingPass, override: b.override }, by, loadPocConfig(sb)); break;
    case "handoverHandler": r = await handoverHandler(sb, id, { receiver: b.receiver ?? "", handlerId: b.handlerId ?? "" }, by, loadPocConfig(sb)); break;
    case "exception": r = await logException(sb, id, { kind: b.kind ?? "", note: b.note ?? "", n: b.n }, by); break;
    case "resolve": r = await resolveException(sb, id, b.excId ?? "", b.resolution ?? "", by); break;
    case "retryBj": r = await retryBagJourney(sb, id); break;
    default: return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  }
  if (r.ok) kickSweep();
  return reply(r);
}
