/** WhatsApp Chatbot & Automation — shared types. Three jsonb-doc tables
 *  (wa_conversations, wa_messages, wa_events — see
 *  supabase/migration_005_whatsapp_automation.sql), one settings row
 *  (`wa:config`, same `settings` table every other module already uses for
 *  keyed config — see waConfig.ts). No node-only imports here: this file is
 *  imported from both server routes and the admin UI. */

/** Who/what currently owns replies in this conversation. */
export type WaConvState = "bot" | "human" | "resolved";

/** A conversation is keyed by the customer's normalized 10-digit mobile
 *  (no country code) — one row per customer, not per thread, matching how
 *  WhatsApp itself has exactly one chat per contact. */
export interface WaConversation {
  mobile: string;             // normalized 10 digits, no country code — same id as the row
  waId?: string;               // Meta's wa_id for this contact (usually "91" + mobile), from the last inbound message
  name?: string;                // WhatsApp profile name Meta reports, or the name the bot collected
  state: WaConvState;
  optedOut?: boolean;           // customer sent STOP/UNSUBSCRIBE — automation permanently off for this mobile until they message again AND an admin clears it
  assignedTo?: string;          // free-text staff name, set from Live Conversations after a handover
  handoverReason?: string;
  leadId?: string;              // CrmActivity.id, once a lead exists for this conversation
  bookingId?: string;           // Booking.id (the "quoted" draft, once created)
  lastInboundAt?: string;
  lastOutboundAt?: string;
  lastMessagePreview?: string;
  unread?: boolean;             // true from the moment of an inbound message until an admin opens the thread
  /** Slot-filling progress for the guided "collect travel/baggage details"
   *  flow — see waBot.ts. Only ever holds fields the customer hasn't
   *  confirmed on an existing lead yet (hard rule: never re-ask what's
   *  already known). */
  botContext?: {
    step?: "await_service" | "await_from" | "await_to" | "await_bags" | "await_date" | "await_name" | "confirm" | "done";
    service?: string;
    fromName?: string;
    toName?: string;
    bags?: number;
    date?: string;
    name?: string;
    attempts?: number;          // consecutive turns the bot couldn't parse a reply — a handover trigger past a threshold
  };
  followUp?: {
    stage: number;               // how many follow-ups already sent for the current lead/quote
    nextAt?: string;             // ISO — when the next one is due
    lastSentAt?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type WaMessageDirection = "in" | "out";

export interface WaMessage {
  conversationId: string;       // = WaConversation.mobile
  direction: WaMessageDirection;
  text: string;
  /** set when this was a bot-authored reply vs. a human admin's manual reply
   *  vs. the raw customer text vs. "team" — a message your own staff sent
   *  from the regular WhatsApp app/Web on this number (Meta's Coexistence
   *  "smb_message_echoes" signal) rather than from this dashboard. */
  from: "customer" | "bot" | "team" | `admin:${string}`;
  template?: string;             // the automation.ts TEMPLATES key, if this went out through notify()/the outbox
  waId?: string;                 // Meta's wamid, when known
  /** sent/delivered/read/failed for an OUTBOUND message, filled in later by
   *  the delivery-status webhook (never set for "customer"/"team" rows). */
  waStatus?: "sent" | "delivered" | "read" | "failed";
  /** set on an inbound photo/document/video/voice note — the Supabase
   *  Storage PATH (never a public/signed URL — see fetchWhatsAppMedia in
   *  automation.ts) in the private "wa-media" bucket, if the download
   *  succeeded; absent if it failed or was never attempted (the text
   *  placeholder — "[Photo]" etc — still carries the event either way). */
  mediaPath?: string;
  /** NEVER stored — set only on the object the admin API returns, a
   *  short-lived signed URL resolved from mediaPath at request time (same
   *  120s-TTL-per-request convention as identity/payment-proof documents
   *  elsewhere in this app), so the UI can show an actual image. */
  mediaUrl?: string;
  mediaContentType?: string;
  /** the quick-reply buttons THIS message itself offered, when it was sent
   *  via sendWhatsAppButtons rather than plain text (e.g. an FAQ answer's
   *  "Talk to a human" button) — shown under the bubble in the UI. */
  buttons?: { id: string; title: string }[];
  at: string;
}

/** One line of the Automation History log (section C of the admin module). */
export type WaEventType =
  | "message_in" | "auto_reply" | "welcome_sent" | "faq_answered"
  | "lead_created" | "lead_linked" | "quote_drafted" | "quote_sent"
  | "handover" | "resumed_bot" | "resolved" | "opt_out"
  | "followup_scheduled" | "followup_sent" | "followup_skipped"
  | "error";

export interface WaEvent {
  type: WaEventType;
  conversationId?: string;
  leadId?: string;
  bookingId?: string;
  detail: string;                // human-readable one-liner for the History table
  error?: string;
  at: string;
}

/* ================= Chatbot Settings (settings row "wa:config") ================= */

export interface WaFaqEntry { id: string; question: string; answer: string }

export interface WaBusinessHours {
  tz: string;                    // IANA, default "Asia/Kolkata"
  days: number[];                // 0=Sunday..6=Saturday, which days are "business hours"
  start: string;                 // "HH:MM" 24h, local to tz
  end: string;
}

export interface WaHandoverRules {
  keywordTriggers: string[];     // e.g. "agent", "human", "call me", "manager"
  dissatisfactionKeywords: string[]; // basic keyword list, NOT sentiment analysis — see waBot.ts comment
  maxUnparsedTurns: number;      // consecutive turns the bot can't parse before handing over
  onRateOnRequest: boolean;      // hand over immediately when the lane has no chart rate (always true in practice — pricing can't be guessed)
}

export interface WaFollowUpRule {
  enabled: boolean;
  delayHours: number;            // from the triggering event (quote drafted / last inbound)
  maxFollowUps: number;
  template: string;              // automation.ts TEMPLATES key to use (must respect the 24h-window/approved-template rule — see waFollowUp.ts)
}

export interface WaQuoteAutomationRules {
  draftQuoteGenerationEnabled: boolean;
  autoSendQuoteEnabled: boolean;  // hard rule default: false — admin must explicitly opt in
  maxAutoQuoteValidityHours: number;
}

export interface WaConfig {
  chatbotEnabled: boolean;
  autoRepliesEnabled: boolean;
  autoLeadCreationEnabled: boolean;
  automatedFollowUpsEnabled: boolean;
  businessHours: WaBusinessHours;
  welcomeMessage: string;
  thankYouMessage: string;
  faq: WaFaqEntry[];
  handoverRules: WaHandoverRules;
  followUp: WaFollowUpRule;
  quoteAutomation: WaQuoteAutomationRules;
  /** Alert contact(s) for a handover notification — reuses the same shape as
   *  automation.ts's AlertConfig but is its own settings row (wa:config),
   *  not the shared "alerts" row, so this module's on-call contact can
   *  differ from the general ops alert contact. */
  alertMobile?: string;
  alertEmail?: string;
}
