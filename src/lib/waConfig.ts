/** Chatbot Settings — one keyed row (settings id "wa:config"), same pattern
 *  as automation.ts's loadAlerts()/saveAlerts() ("alerts") and
 *  loadDepartments() ("departments"). Defaults here are what ships before
 *  an admin edits anything in section (B) Chatbot Settings — every FAQ
 *  answer below is either lifted verbatim from the approved welcome message
 *  or left as an explicit placeholder the admin must fill in, never an
 *  invented price/policy/timeline (see CLAUDE task's hard rule). Server-only. */
import { serviceClient } from "./supabaseAdmin";
import type { WaConfig } from "./waTypes";

export const WA_CONFIG_ID = "wa:config";

/** Exact text given by the task spec — admin-editable from here on, but
 *  this is what ships on day one. */
export const DEFAULT_WELCOME_MESSAGE =
`Thank you for reaching out to Bagdrop!
We offer airport baggage pickup and drop, door-to-door outstation delivery, excess baggage solutions, and luggage storage services.
To help us serve you better, kindly share your travel and baggage details here:
https://www.bagdrop.co/book
Once we receive your details, our team will get in touch with you shortly to confirm availability, pricing, and schedule.
For anything urgent, reply to this message directly.
Contact details:
+91 63 5711 5711
+91 63 5733 5733
Email: info@bagdrop.co`;

export const DEFAULT_THANK_YOU_MESSAGE =
`Thanks for your patience! We've noted your details — our team will confirm availability, pricing and schedule shortly. For anything urgent, reply to this message directly or call +91 63 5711 5711.`;

/** Placeholder answers are intentionally honest about being unset — never a
 *  guessed price/policy. The admin fills in the real wording in section (B). */
const PLACEHOLDER = "[Not yet configured by the Bagdrop team — ask the team directly, or edit this answer in WhatsApp Chatbot & Automation → Chatbot Settings → FAQ.]";

export const DEFAULT_FAQ: WaConfig["faq"] = [
  { id: "services", question: "What services does Bagdrop offer?", answer: "We offer airport baggage pickup and drop, door-to-door outstation delivery, excess baggage solutions, and luggage storage services." },
  { id: "pricing", question: "How much will it cost?", answer: "Pricing depends on your route, number of bags and service — share your pickup city, drop city, number of bags and travel date here and we'll work out the price for you." },
  { id: "timeline", question: "How soon can you pick up my bags?", answer: PLACEHOLDER },
  { id: "payment", question: "How do I pay?", answer: PLACEHOLDER },
  { id: "tracking", question: "Can I track my bags?", answer: PLACEHOLDER },
  { id: "cancel", question: "Can I cancel or reschedule?", answer: PLACEHOLDER },
];

export const DEFAULT_WA_CONFIG: WaConfig = {
  chatbotEnabled: true,
  autoRepliesEnabled: true,
  autoLeadCreationEnabled: true,
  automatedFollowUpsEnabled: false,
  businessHours: { tz: "Asia/Kolkata", days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "20:00" },
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  thankYouMessage: DEFAULT_THANK_YOU_MESSAGE,
  faq: DEFAULT_FAQ,
  handoverRules: {
    keywordTriggers: ["agent", "human", "talk to someone", "representative", "manager", "call me", "speak to"],
    dissatisfactionKeywords: ["angry", "worst", "terrible", "complaint", "complain", "refund", "scam", "unacceptable", "disappointed"],
    maxUnparsedTurns: 2,
    onRateOnRequest: true,
  },
  followUp: { enabled: false, delayHours: 24, maxFollowUps: 2, template: "quote_nudge" },
  quoteAutomation: { draftQuoteGenerationEnabled: true, autoSendQuoteEnabled: false, maxAutoQuoteValidityHours: 24 },
};

let cache: { cfg: WaConfig; at: number } | null = null;

/** Merges saved config over the defaults field-by-field (one level deep for
 *  the nested objects) so adding a new default field later never requires a
 *  migration of the saved settings row. */
function merge(saved: Partial<WaConfig> | null | undefined): WaConfig {
  if (!saved) return DEFAULT_WA_CONFIG;
  return {
    ...DEFAULT_WA_CONFIG,
    ...saved,
    businessHours: { ...DEFAULT_WA_CONFIG.businessHours, ...(saved.businessHours ?? {}) },
    handoverRules: { ...DEFAULT_WA_CONFIG.handoverRules, ...(saved.handoverRules ?? {}) },
    followUp: { ...DEFAULT_WA_CONFIG.followUp, ...(saved.followUp ?? {}) },
    quoteAutomation: { ...DEFAULT_WA_CONFIG.quoteAutomation, ...(saved.quoteAutomation ?? {}) },
    faq: saved.faq?.length ? saved.faq : DEFAULT_WA_CONFIG.faq,
  };
}

export async function loadWaConfig(): Promise<WaConfig> {
  if (cache && Date.now() - cache.at < 30_000) return cache.cfg;
  const sb = serviceClient();
  if (!sb) return DEFAULT_WA_CONFIG;
  const { data } = await sb.from("settings").select("doc").eq("id", WA_CONFIG_ID).maybeSingle();
  const cfg = merge(data?.doc as Partial<WaConfig> | null);
  cache = { cfg, at: Date.now() };
  return cfg;
}

export async function saveWaConfig(patch: Partial<WaConfig>): Promise<WaConfig> {
  const sb = serviceClient();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");
  const current = await loadWaConfig();
  const next = merge({ ...current, ...patch });
  const { error } = await sb.from("settings").upsert({ id: WA_CONFIG_ID, doc: next, status: null, created: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = { cfg: next, at: Date.now() };
  return next;
}
