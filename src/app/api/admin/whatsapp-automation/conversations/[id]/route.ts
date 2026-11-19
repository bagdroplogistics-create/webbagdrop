import { NextResponse } from "next/server";
import { isAdminRequest, actorName } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { sendWhatsApp } from "@/lib/automation";
import { addMessage, getConversation, listMessages, logEvent, normalizeMobile, saveConversation } from "@/lib/waStore";

/** Live Conversations (section A) detail view — one conversation's full
 *  thread, plus the actions a human admin can take: manual reply,
 *  take-over / return-to-bot, mark resolved. `id` is the normalized
 *  10-digit mobile (the conversation's own primary key). */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const id = normalizeMobile((await params).id);
  const conversation = await getConversation(sb, id);
  if (!conversation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const messages = await listMessages(sb, id);
  return NextResponse.json({ ok: true, conversation, messages });
}

type Action =
  | { action: "take_over" }
  | { action: "return_to_bot" }
  | { action: "resolve" }
  | { action: "reply"; text: string };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const id = normalizeMobile((await params).id);
  const conversation = await getConversation(sb, id);
  if (!conversation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let body: Action;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const who = await actorName();
  const now = new Date().toISOString();

  if (body.action === "take_over") {
    conversation.state = "human";
    conversation.assignedTo = who;
    conversation.handoverReason = conversation.handoverReason ?? "admin took over manually";
    conversation.updatedAt = now;
    await saveConversation(sb, conversation);
    await logEvent(sb, { type: "handover", conversationId: id, leadId: conversation.leadId, bookingId: conversation.bookingId, detail: `${who} took over manually.`, at: now });
  } else if (body.action === "return_to_bot") {
    conversation.state = "bot";
    conversation.assignedTo = undefined;
    conversation.handoverReason = undefined;
    conversation.updatedAt = now;
    await saveConversation(sb, conversation);
    await logEvent(sb, { type: "resumed_bot", conversationId: id, leadId: conversation.leadId, bookingId: conversation.bookingId, detail: `${who} returned this conversation to the bot.`, at: now });
  } else if (body.action === "resolve") {
    conversation.state = "resolved";
    conversation.followUp = null;
    conversation.unread = false;
    conversation.updatedAt = now;
    await saveConversation(sb, conversation);
    await logEvent(sb, { type: "resolved", conversationId: id, leadId: conversation.leadId, bookingId: conversation.bookingId, detail: `${who} marked this conversation resolved.`, at: now });
  } else if (body.action === "reply") {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "EMPTY_REPLY" }, { status: 400 });
    // a manual reply only works within WhatsApp's 24h customer-service window (free-form text) —
    // same constraint every send in this project already has; surfaced here rather than silently failing.
    try {
      await sendWhatsApp(conversation.waId ?? conversation.mobile, text);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "SEND_FAILED" }, { status: 502 });
    }
    await addMessage(sb, { conversationId: id, direction: "out", text, from: `admin:${who}`, at: now });
    conversation.unread = false;
    conversation.lastOutboundAt = now;
    conversation.updatedAt = now;
    await saveConversation(sb, conversation);
  } else {
    return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  }

  const messages = await listMessages(sb, id);
  return NextResponse.json({ ok: true, conversation, messages });
}
