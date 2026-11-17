import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { OutboxDoc } from "@/lib/automation";

/** WhatsApp Cloud API delivery-status webhook — the only way to learn what
 *  actually happened after Meta accepts a send. The /messages endpoint's
 *  "accepted" response is not proof of delivery: a free-form text outside
 *  the 24h session window, or a template Meta later flags, both come back
 *  200 OK and then vanish with nothing in the API response to show for it.
 *  This records Meta's own sent/delivered/read/failed callback against the
 *  outbox row it belongs to, so the Automation desk shows the true state
 *  instead of just "we handed it to Meta".
 *
 *  Register this URL (https://<domain>/api/hooks/whatsapp) in Meta's App
 *  dashboard → WhatsApp → Configuration → Webhook, subscribed to the
 *  "messages" field, with WHATSAPP_WEBHOOK_VERIFY_TOKEN set to whatever
 *  verify token you type into that same dashboard field. */

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
type Body = { entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[] };

export async function POST(req: Request) {
  /* Meta always expects 200 quickly, or it retries the same event for hours —
   * acknowledge first, work is small and best-effort either way. */
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ ok: true });

  const statuses = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []));
  for (const s of statuses) {
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
  return NextResponse.json({ ok: true });
}
