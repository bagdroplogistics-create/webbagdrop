/** WhatsApp Chatbot & Automation — scheduled follow-ups + Automation
 *  History housekeeping. Called once from the existing daily worker
 *  (src/app/api/worker/route.ts), the SAME cron + "Run now" admin button
 *  automation.ts's own sweep already uses — deliberately NOT called from
 *  inside automation.ts's runSweep() itself, to avoid a circular import
 *  (this file needs notify()/kickSweep()/hasApprovedTemplate from
 *  automation.ts; automation.ts would need waFollowUpPass from here).
 *
 *  Hard rules enforced here, not just documented: a follow-up NEVER sends
 *  once the thread left "bot" state (handed over, resolved, or the
 *  customer opted out), NEVER sends to a cancelled/rejected booking, and
 *  NEVER sends free-form text once the conversation is outside WhatsApp's
 *  24h customer-service window UNLESS the configured template has a real
 *  approved mapping — otherwise it would just throw at Meta's API (see
 *  automation.ts's long comment on this). In every "can't send yet" case
 *  the follow-up is rescheduled or quietly dropped, never silently lost. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify, kickSweep, hasApprovedTemplate } from "./automation";
import { loadWaConfig } from "./waConfig";
import { listConversations, logEvent, pruneOldEvents, saveConversation } from "./waStore";
import type { Booking } from "./types";

type SB = SupabaseClient;
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const nowIso = () => new Date().toISOString();

/** Once-a-day guard for the prune step, same idea as automation.ts's daily
 *  gatewayReconPass guard, implemented inline (no automation.ts import
 *  needed for this part) via a plain settings row. */
async function pruneOnceADay(sb: SB): Promise<void> {
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const { data } = await sb.from("settings").select("doc").eq("id", "wa:lastprune").maybeSingle();
  if ((data?.doc as { day?: string } | null)?.day === day) return;
  await pruneOldEvents(sb, 90);
  await sb.from("settings").upsert({ id: "wa:lastprune", doc: { day }, status: null, created: new Date().toISOString() });
}

export async function waFollowUpPass(sb: SB): Promise<{ sent: number; skipped: number }> {
  await pruneOnceADay(sb);

  const cfg = await loadWaConfig();
  let sent = 0, skipped = 0;
  if (!cfg.automatedFollowUpsEnabled || !cfg.followUp.enabled) return { sent, skipped };

  const now = Date.now();
  const candidates = await listConversations(sb, { status: "bot", limit: 500 });
  for (const conv of candidates) {
    if (conv.optedOut || !conv.followUp || !conv.followUp.nextAt) continue;
    if (Date.parse(conv.followUp.nextAt) > now) continue;
    if (!conv.bookingId) { conv.followUp = null; await saveConversation(sb, conv); continue; }

    const { data: bk } = await sb.from("bookings").select("doc").eq("id", conv.bookingId).maybeSingle();
    const booking = bk?.doc as Booking | undefined;
    // stop condition: cancelled/rejected, or already moved past "quoted" (team is already on it some other way)
    if (!booking || ["cancelled", "rejected"].includes(booking.status) || booking.status !== "quoted") {
      conv.followUp = null;
      await saveConversation(sb, conv);
      continue;
    }

    const hoursSinceInbound = conv.lastInboundAt ? (now - Date.parse(conv.lastInboundAt)) / 3600_000 : 999;
    const canSendFreeText = hoursSinceInbound < 24;
    if (!canSendFreeText && !hasApprovedTemplate(cfg.followUp.template)) {
      skipped++;
      await logEvent(sb, { type: "followup_skipped", conversationId: conv.mobile, leadId: conv.leadId, bookingId: conv.bookingId, detail: `Skipped — outside the 24h window and "${cfg.followUp.template}" has no approved template yet.`, at: nowIso() });
      // don't retry every run forever — push it out a day and let it keep trying in case the admin approves a template
      conv.followUp = { ...conv.followUp, nextAt: new Date(now + 24 * 3600_000).toISOString() };
      await saveConversation(sb, conv);
      continue;
    }

    const name = booking.traveller.name;
    const lane = `${booking.from} → ${booking.to}`;
    const d = { lane, ref: booking.id, amount: inr(booking.quote?.total ?? 0), link: `/q/${booking.id}` };
    await notify(cfg.followUp.template, { name, mobile: booking.traveller.mobile, email: booking.traveller.email }, d, `wafollowup:${booking.id}:${(conv.followUp.stage ?? 0) + 1}`);
    kickSweep();
    sent++;
    const stage = (conv.followUp.stage ?? 0) + 1;
    conv.followUp = stage >= cfg.followUp.maxFollowUps ? null : { stage, nextAt: new Date(now + cfg.followUp.delayHours * 3600_000).toISOString(), lastSentAt: nowIso() };
    await saveConversation(sb, conv);
    await logEvent(sb, { type: "followup_sent", conversationId: conv.mobile, leadId: conv.leadId, bookingId: conv.bookingId, detail: `Follow-up #${stage} sent (${cfg.followUp.template}).`, at: nowIso() });
  }
  return { sent, skipped };
}
