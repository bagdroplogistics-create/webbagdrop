import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { OutboxDoc } from "@/lib/automation";
import { handleInboundMessage } from "@/lib/waBot";
import { logEvent } from "@/lib/waStore";

/** WhatsApp Cloud API webhook — TWO jobs on one URL/subscription, since Meta
 *  only ever lets you register one webhook per app for the "messages" field
 *  and delivers both kinds of event to it:
 *
 *  1. Delivery-status callbacks (sent/delivered/read/failed) for OUR sends —
 *     the /messages endpoint's "accepted" response is not proof of
 *     delivery: a free-form text outside the 24h session window, or a
 *     template Meta later flags, both come back 200 OK and then vanish with
 *     nothing in the API response to show for it. This records Meta's own
 *     callback against the outbox row it belongs to, so the Automation desk
 *     shows the true state instead of just "we handed it to Meta". (This
 *     half of the file is unchanged from before the chatbot module.)
 *  2. INCOMING customer messages (2026-11-19, WhatsApp Chatbot & Automation
 *     module) — routed to src/lib/waBot.ts, which owns everything from
 *     here: FAQ auto-replies, collecting travel/baggage details, lead
 *     dedup + draft-quote creation, follow-up scheduling and human
 *     handover. This route itself stays a thin, best-effort dispatcher.
 *  3. Forwarding every status payload on to bagdrop-web's own
 *     /api/whatsapp/webhook (see forwardStatusToBagdropWeb below) — this
 *     webhook replaced that one as Meta's single registered callback, so
 *     without this, bagdrop-web's own delivery-status lookup
 *     (app/api/admin/bookings/[id]/send-whatsapp's GET) would go stale.
 *     Zero code changes on bagdrop-web's side; it just keeps receiving the
 *     exact same payloads it always did, one hop later.
 *
 *  Register this URL (https://<domain>/api/hooks/whatsapp) in Meta's App
 *  dashboard → WhatsApp → Configuration → Webhook, subscribed to the
 *  "messages" field, with WHATSAPP_WEBHOOK_VERIFY_TOKEN set to whatever
 *  verify token you type into that same dashboard field. Optionally also
 *  set META_WHATSAPP_APP_SECRET (the Meta App's "App secret", not the
 *  WhatsApp access token) to verify Meta's X-Hub-Signature-256 on every
 *  POST — recommended once this route can create leads/bookings, not just
 *  update an existing outbox row; without it the route still works
 *  (signature check is skipped, same graceful-degradation convention as
 *  automation.ts's providers), it's just unauthenticated. */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "VERIFICATION_FAILED" }, { status: 403 });
}

type StatusEvent = { id?: string; status?: string; errors?: { title?: string; message?: string }[] };
type IncomingMessage = { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } };
type Contact = { wa_id?: string; profile?: { name?: string } };
type Body = { entry?: { changes?: { value?: { statuses?: StatusEvent[]; messages?: IncomingMessage[]; contacts?: Contact[] } }[] }[] };

function signatureValid(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured — skip the check rather than refuse every delivery
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(header.slice(7));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 2026-11-19: now that Meta's one webhook subscription points here instead
 *  of bagdrop-web's own /api/whatsapp/webhook, bagdrop-web's delivery-status
 *  lookup (app/api/admin/bookings/[id]/send-whatsapp's GET — "did this
 *  actually deliver") would otherwise go stale, since it reads a table only
 *  THAT webhook used to fill. Forward every raw status-bearing payload over
 *  so bagdrop-web's own route (unchanged, zero code touched there) keeps
 *  populating it exactly as before. Fire-and-forget via after(), same
 *  convention as automation.ts's kickSweep() — this can never fail the
 *  response Meta is waiting on, and a missing/misconfigured PROD_SITE_URL
 *  (or bagdrop-web rejecting it, e.g. its own WHATSAPP_APP_SECRET check) is
 *  silently swallowed, not retried — Meta's own retry-on-non-200 already
 *  covers this URL; retrying a side forward too would just double it. */
function forwardStatusToBagdropWeb(raw: string, header: string | null): void {
  const site = process.env.PROD_SITE_URL;
  if (!site) return;
  after(async () => {
    try {
      await fetch(`${site.replace(/\/$/, "")}/api/whatsapp/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(header ? { "x-hub-signature-256": header } : {}) },
        body: raw,
      });
    } catch { /* best-effort — see comment above */ }
  });
}

export async function POST(req: Request) {
  /* Meta always expects 200 quickly, or it retries the same event for hours —
   * acknowledge first, work is small and best-effort either way. */
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  }
  let body: Body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  forwardStatusToBagdropWeb(raw, req.headers.get("x-hub-signature-256"));
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ ok: true });

  const values = (body.entry ?? []).flatMap((e) => e.changes ?? []).map((c) => c.value ?? {});

  for (const value of values) {
    for (const s of value.statuses ?? []) {
      if (!s.id || !s.status) continue;
      const { data: map } = await sb.from("settings").select("doc").eq("id", `wa:${s.id}`).maybeSingle();
      const outboxId = (map?.doc as { outboxId?: string } | null)?.outboxId;
      if (!outboxId) continue; // a status for a message we didn't send through the outbox (e.g. an OTP) — nothing to attach it to
      const { data: row } = await sb.from("outbox").select("id, doc").eq("id", outboxId).maybeSingle();
      if (!row) continue;
      const doc = row.doc as OutboxDoc;
      const waStatus = s.status as OutboxDoc["waStatus"];
      const next: OutboxDoc = { ...doc, waStatus, waError: s.errors?.[0] ? `${s.errors[0].title ?? ""} ${s.errors[0].message ?? ""}`.trim() : doc.waError };
      await sb.from("outbox").update({ doc: next }).eq("id", outboxId);
    }

    const contactByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name] as const));
    for (const m of value.messages ?? []) {
      if (!m.id || !m.from || m.type !== "text" || !m.text?.body) continue; // non-text (image/voice/location/…) — out of scope for the bot today, logged below
      try {
        await handleInboundMessage(sb, {
          mobile: m.from, waId: m.from, profileName: contactByWaId.get(m.from), text: m.text.body, wamid: m.id, timestamp: m.timestamp,
        });
      } catch (e) {
        await logEvent(sb, { type: "error", conversationId: m.from.replace(/\D/g, "").slice(-10), detail: "handleInboundMessage threw — see error field.", error: e instanceof Error ? e.message : String(e), at: new Date().toISOString() }, `waerr:${m.id}`);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
