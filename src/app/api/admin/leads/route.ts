import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { makeQuotedBooking, requoteBooking, type LeadInput } from "@/lib/quoteFactory";
import { notify, kickSweep } from "@/lib/automation";
import type { Booking, CrmActivity } from "@/lib/types";

/** Ads lead importer + pending-rate release.
 *
 *  import: each row becomes a booking (auto-quoted and SIGNED when the
 *  route is on the rate masters; rate-on-request otherwise) plus a CRM
 *  lead carrying the ad source/campaign. Quoted leads get the payment
 *  link's WhatsApp+email pair queued instantly; unmatched routes land in
 *  the pending-rates queue and nothing is priced by guesswork — the
 *  pricing team feeds the rate, then `release` re-quotes the whole lane.
 *  Dedupe: a mobile already carrying an OPEN lead is skipped, never
 *  double-quoted (idempotent at the data layer, six-sigma style). */

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

async function handlePOST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let body: { action?: "import" | "release"; rows?: (LeadInput & { campaign?: string })[]; lane?: { from: string; to: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const { data: crmData, error: crmErr } = await sb.from("crm").select("doc");
  if (crmErr) return NextResponse.json({ error: crmErr.message }, { status: 500 });
  const activity = (crmData ?? []).map((r) => r.doc as CrmActivity);

  if (body.action === "import") {
    const rows = (body.rows ?? []).slice(0, 500);
    if (!rows.length) return NextResponse.json({ error: "NO_ROWS" }, { status: 400 });
    const openMobiles = new Set(
      activity.filter((a) => a.kind === "lead" && a.stage && !["won", "lost"].includes(a.stage))
        .map((a) => (a.mobile ?? "").replace(/\D/g, "").slice(-10)).filter(Boolean)
    );
    let quoted = 0, pending = 0, skipped = 0, invalid = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      const mob = (r.mobile ?? "").replace(/\D/g, "").slice(-10);
      if (!r.name || mob.length !== 10 || !r.fromName || !r.toName) { invalid++; continue; }
      if (openMobiles.has(mob)) { skipped++; continue; }
      openMobiles.add(mob);

      const { doc, ror, total } = await makeQuotedBooking(r);
      const { error: bkErr } = await sb.from("bookings").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
      if (bkErr) { invalid++; continue; }

      const lead: CrmActivity = {
        id: `CRM-A-${doc.id.slice(-8)}`, created: now, kind: "lead",
        stage: ror ? "new" : "quoted",
        text: `Lead · ${r.name} (${r.fromName} → ${r.toName})`,
        value: ror ? 0 : total, mobile: r.mobile, email: r.email, contact: r.mobile,
        source: r.source ?? "ads", campaign: r.campaign,
        route: { from: r.fromName, to: r.toName, bags: r.bags, date: r.date },
        ratePending: ror || undefined,
        quoteInfo: ror ? undefined : { qid: doc.quote.qid, total, validUntil: doc.quote.validUntil ?? undefined, link: `/q/${doc.id}` },
        refId: doc.id, followKey: `autolead:${doc.id}`,
      };
      await sb.from("crm").upsert({ id: lead.id, doc: lead, status: null, created: now });

      if (ror) {
        pending++;
        await notify("inquiry_ack", { name: r.name, mobile: r.mobile, email: r.email }, { lane: `${r.fromName} → ${r.toName}`, ref: doc.id }, `ack:${doc.id}`);
      } else {
        quoted++;
        await notify("quote_ready", { name: r.name, mobile: r.mobile, email: r.email },
          { lane: `${r.fromName} → ${r.toName}`, ref: doc.id, amount: inr(total), link: `/q/${doc.id}` }, `ack:${doc.id}`);
      }
    }
    kickSweep();
    return NextResponse.json({ ok: true, quoted, pending, skipped, invalid, total: rows.length });
  }

  if (body.action === "release") {
    if (!body.lane?.from || !body.lane?.to) return NextResponse.json({ error: "MISSING_LANE" }, { status: 400 });
    const targets = activity.filter((a) => a.ratePending && a.route &&
      a.route.from.toLowerCase() === body.lane!.from.toLowerCase() && a.route.to.toLowerCase() === body.lane!.to.toLowerCase());
    let released = 0, failed = 0;
    for (const lead of targets) {
      const { data: bk } = await sb.from("bookings").select("doc").eq("id", lead.refId!).maybeSingle();
      if (!bk) { failed++; continue; }
      const rq = await requoteBooking(bk.doc as Booking);
      if (!rq) { failed++; continue; }                       // rate still not on the masters
      await saveOrThrow(sb, rq.doc);
      const upd: CrmActivity = { ...lead, ratePending: undefined, stage: "quoted", value: rq.doc.quote.total,
        quoteInfo: { qid: rq.doc.quote.qid, total: rq.doc.quote.total, validUntil: rq.doc.quote.validUntil ?? undefined, link: `/q/${rq.doc.id}` } };
      await sb.from("crm").upsert({ id: upd.id, doc: upd, status: null, created: upd.created });
      await notify("quote_ready", { name: rq.doc.traveller.name, mobile: rq.doc.traveller.mobile, email: rq.doc.traveller.email },
        { lane: `${rq.doc.from} → ${rq.doc.to}`, ref: rq.doc.id, amount: inr(rq.doc.quote.total), link: `/q/${rq.doc.id}` }, `rel:${rq.doc.id}`);
      released++;
    }
    kickSweep();
    return NextResponse.json({ ok: true, released, failed, matched: targets.length });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}

export const POST = retryOnConflict(handlePOST);
