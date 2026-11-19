"use client";
/** WhatsApp Chatbot & Automation — three sub-tabs, same pill-tab pattern as
 *  ShipmentsHub/CRM/LeadImport/Reports (src/app/admin/page.tsx). Section A
 *  (Live Conversations), B (Chatbot Settings) and C (Automation History). */
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select, Drawer, TableFrame } from "@/components/ui";
import {
  fetchConversation, fetchHistory, loadWaSettings, replyToConversation, resolveConversation, returnConversationToBot,
  saveWaSettings, takeOverConversation, uploadAttachment, watchConversations, type StagedAttachment,
} from "@/lib/waAdminApi";
import type { WaConfig, WaConversation, WaEvent, WaFaqEntry, WaMessage } from "@/lib/waTypes";

/** Plain Unicode check marks, same visual language as WhatsApp's own
 *  ticks — not a custom icon font, just text. */
function Ticks({ status }: { status?: WaMessage["waStatus"] }) {
  if (!status) return null;
  if (status === "failed") return <span className="text-red-200"> · failed</span>;
  if (status === "read") return <span className="text-sky-200"> ✓✓</span>;
  if (status === "delivered") return <span> ✓✓</span>;
  return <span> ✓</span>;
}

const STATE_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  bot: "info", human: "warn", resolved: "ok", opted_out: "muted",
};
const STATE_LABEL: Record<string, string> = { bot: "Bot active", human: "Needs human", resolved: "Resolved", opted_out: "Opted out" };

function istTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/* ================= (A) Live Conversations ================= */
function LiveConversations() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<WaConversation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => watchConversations({ status: status || undefined, q: q || undefined }, setRows, (e) => setErr(e instanceof Error ? e.message : String(e))), [status, q]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status" hint={undefined}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-48">
            <option value="">All</option>
            <option value="bot">Bot active</option>
            <option value="human">Needs human</option>
            <option value="resolved">Resolved</option>
            <option value="opted_out">Opted out</option>
          </Select>
        </Field>
        <Field label="Search name / mobile / lead id">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="98765 43210" className="!w-64" />
        </Field>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <TableFrame>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-muted">
              <th className="px-3 py-2">Customer</th><th className="px-3 py-2">Mobile</th>
              <th className="px-3 py-2">Last message</th><th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Last activity</th><th className="px-3 py-2">Lead / booking</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.mobile} className="cursor-pointer border-t border-line hover:bg-paper" onClick={() => setOpen(c.mobile)}>
                <td className="px-3 py-2 font-medium">{c.unread && <i className="mr-1.5 inline-block size-2 rounded-full bg-brand" />}{c.name ?? "—"}</td>
                <td className="px-3 py-2">{c.mobile}</td>
                <td className="max-w-80 truncate px-3 py-2 text-muted">{c.lastMessagePreview ?? "—"}</td>
                <td className="px-3 py-2"><Badge tone={STATE_TONE[c.optedOut ? "opted_out" : c.state]}>{STATE_LABEL[c.optedOut ? "opted_out" : c.state]}</Badge></td>
                <td className="px-3 py-2 text-muted">{istTime(c.lastInboundAt ?? c.updatedAt)}</td>
                <td className="px-3 py-2 text-muted">{c.leadId ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No conversations yet.</td></tr>}
          </tbody>
        </table>
      </TableFrame>
      {open && <ConversationDrawer mobile={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ConversationDrawer({ mobile, onClose }: { mobile: string; onClose: () => void }) {
  const [data, setData] = useState<{ conversation: WaConversation; messages: WaMessage[] } | null>(null);
  const [reply, setReply] = useState("");
  const [attachment, setAttachment] = useState<StagedAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => fetchConversation(mobile).then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e))), [mobile]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };

  const conv = data?.conversation;
  const initial = (conv?.name ?? mobile).trim().charAt(0).toUpperCase() || "#";
  return (
    <Drawer open onClose={onClose} title={conv ? `${conv.name ?? "Unknown"} · ${conv.mobile}` : mobile} wide>
      {!data ? <div className="text-sm text-muted">Loading…</div> : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-base font-bold text-brand">{initial}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-sm font-bold">{conv!.name ?? "Unknown customer"}</div>
              <div className="text-xs text-muted">{conv!.mobile}</div>
            </div>
            <Badge tone={STATE_TONE[conv!.optedOut ? "opted_out" : conv!.state]}>{STATE_LABEL[conv!.optedOut ? "opted_out" : conv!.state]}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {conv!.state !== "human" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => takeOverConversation(mobile))}>Take over</Button>}
            {conv!.state === "human" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => returnConversationToBot(mobile))}>Return to bot</Button>}
            {conv!.state !== "resolved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => resolveConversation(mobile))}>Mark resolved</Button>}
            {(conv!.leadId || conv!.bookingId) && (
              <span className="self-center rounded-full bg-paper px-2.5 py-1 text-xs text-muted">
                Lead {conv!.leadId ?? "—"} · Booking {conv!.bookingId ?? "—"}
              </span>
            )}
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          {/* Capped (not a fixed total-card height): a short thread stays compact with
              no scrolling needed anywhere, a long one scrolls ONLY inside this box —
              the reply bar right after it in normal flow is always right there. */}
          <div className="max-h-[50vh] min-h-[220px] overflow-y-auto rounded-xl border border-line bg-paper p-4">
            {data.messages.map((m, i) => {
              const isTeam = m.from === "team"; // sent from the regular WhatsApp app/Web, not this dashboard
              const out = m.direction === "out";
              return (
                <div key={i} className={`mb-3 flex ${out ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] shadow-sm ${out ? (isTeam ? "bg-slate-600 text-white" : "bg-brand text-white") : "bg-white border border-line text-ink"}`}>
                    {m.mediaUrl && (
                      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 block">
                        {m.mediaContentType?.startsWith("image/")
                          ? <img src={m.mediaUrl} alt="Attachment" className="max-h-56 rounded-lg border border-white/20 object-cover" />
                          : <span className="underline">Open attachment</span>}
                      </a>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                    {!!m.buttons?.length && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.buttons.map((b) => <span key={b.id} className="rounded-full border border-white/30 px-2 py-0.5 text-[11px]">{b.title}</span>)}
                      </div>
                    )}
                    <div className={`mt-1.5 text-[11px] ${out ? "text-white/70" : "text-faint"}`}>
                      {isTeam ? "team · via WhatsApp" : m.from} · {istTime(m.at)}{out && <Ticks status={m.waStatus} />}
                    </div>
                  </div>
                </div>
              );
            })}
            {!data.messages.length && <div className="py-10 text-center text-sm text-muted">No messages yet.</div>}
          </div>
          <div className="shrink-0 border-t border-line pt-3">
            {attachment && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs">
                <span className="truncate">{attachment.filename}</span>
                <button type="button" onClick={() => setAttachment(null)} className="cursor-pointer text-muted hover:text-ink" aria-label="Remove attachment">✕</button>
              </div>
            )}
            <div className="flex gap-2">
              <label className={`flex cursor-pointer items-center rounded-xl border border-line px-3 text-xs font-semibold text-muted hover:text-ink ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                {uploading ? "Uploading…" : "Attach"}
                <input
                  type="file" className="hidden" disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploading(true); setErr(null);
                    try { setAttachment(await uploadAttachment(mobile, file)); }
                    catch (err2) { setErr(err2 instanceof Error ? err2.message : String(err2)); }
                    finally { setUploading(false); }
                  }}
                />
              </label>
              <Input
                value={reply} onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && (reply.trim() || attachment) && !busy) { e.preventDefault(); act(async () => { await replyToConversation(mobile, reply, attachment ?? undefined); setReply(""); setAttachment(null); }); } }}
                placeholder={attachment ? "Optional caption…" : "Reply manually (only reaches the customer within 24h of their last message)"}
              />
              <Button disabled={busy || uploading || (!reply.trim() && !attachment)} onClick={() => act(async () => { await replyToConversation(mobile, reply, attachment ?? undefined); setReply(""); setAttachment(null); })}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ================= (B) Chatbot Settings ================= */
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

function ChatbotSettings() {
  const [cfg, setCfg] = useState<WaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadWaSettings().then(setCfg).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);

  if (!cfg) return <div className="text-sm text-muted">{err ?? "Loading…"}</div>;
  const set = <K extends keyof WaConfig>(k: K, v: WaConfig[K]) => setCfg({ ...cfg, [k]: v });

  const save = async () => {
    setSaving(true); setErr(null);
    try { setCfg(await saveWaSettings(cfg)); setSavedAt(new Date().toISOString()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const updateFaq = (next: WaFaqEntry[]) => set("faq", next);

  return (
    <div className="grid gap-5">
      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Automation toggles</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Chatbot enabled" checked={cfg.chatbotEnabled} onChange={(v) => set("chatbotEnabled", v)} hint="Master switch — off means every message just logs for a human." />
          <Toggle label="Auto-replies" checked={cfg.autoRepliesEnabled} onChange={(v) => set("autoRepliesEnabled", v)} hint="Welcome message, FAQ answers, and the detail-collection questions." />
          <Toggle label="Auto lead creation" checked={cfg.autoLeadCreationEnabled} onChange={(v) => set("autoLeadCreationEnabled", v)} hint="Create a lead + draft quote once pickup city, drop city and bag count are known." />
          <Toggle label="Draft quote generation" checked={cfg.quoteAutomation.draftQuoteGenerationEnabled} onChange={(v) => set("quoteAutomation", { ...cfg.quoteAutomation, draftQuoteGenerationEnabled: v })} />
          <Toggle label="Automated follow-ups" checked={cfg.automatedFollowUpsEnabled} onChange={(v) => set("automatedFollowUpsEnabled", v)} />
          <Toggle label="Automatic quote sending" checked={cfg.quoteAutomation.autoSendQuoteEnabled} onChange={(v) => set("quoteAutomation", { ...cfg.quoteAutomation, autoSendQuoteEnabled: v })} hint="OFF by default — a draft quote otherwise just waits for admin review in Shipments." />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Business hours</h3>
        <div className="flex flex-wrap gap-3">
          <Field label="Start"><Input type="time" value={cfg.businessHours.start} onChange={(e) => set("businessHours", { ...cfg.businessHours, start: e.target.value })} className="!w-32" /></Field>
          <Field label="End"><Input type="time" value={cfg.businessHours.end} onChange={(e) => set("businessHours", { ...cfg.businessHours, end: e.target.value })} className="!w-32" /></Field>
          <Field label="Timezone"><Input value={cfg.businessHours.tz} onChange={(e) => set("businessHours", { ...cfg.businessHours, tz: e.target.value })} className="!w-40" /></Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Welcome &amp; thank-you messages</h3>
        <Field label="Welcome message (sent once per new conversation)">
          <textarea value={cfg.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} rows={8} className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm" />
        </Field>
        <Field label="Thank-you message (after details are received)">
          <textarea value={cfg.thankYouMessage} onChange={(e) => set("thankYouMessage", e.target.value)} rows={3} className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm" />
        </Field>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">FAQ</h3>
        <div className="grid gap-3">
          {cfg.faq.map((f, i) => (
            <div key={f.id} className="grid gap-2 rounded-xl border border-line p-3">
              <Input value={f.question} onChange={(e) => updateFaq(cfg.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} placeholder="Question" />
              <textarea value={f.answer} onChange={(e) => updateFaq(cfg.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} rows={2} className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm" placeholder="Answer" />
              <div><Button size="sm" variant="ghost" onClick={() => updateFaq(cfg.faq.filter((_, j) => j !== i))}>Remove</Button></div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => updateFaq([...cfg.faq, { id: `faq-${Date.now()}`, question: "", answer: "" }])}>+ Add FAQ</Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Handover rules</h3>
        <Field label="Keywords that always hand over to a human (comma-separated)">
          <Input value={cfg.handoverRules.keywordTriggers.join(", ")} onChange={(e) => set("handoverRules", { ...cfg.handoverRules, keywordTriggers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <Field label="Dissatisfaction keywords (comma-separated — basic keyword match, not sentiment analysis)">
          <Input value={cfg.handoverRules.dissatisfactionKeywords.join(", ")} onChange={(e) => set("handoverRules", { ...cfg.handoverRules, dissatisfactionKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <Field label="Hand over after this many turns the bot can't understand" hint="Low-confidence trigger.">
          <Input type="number" min={1} value={cfg.handoverRules.maxUnparsedTurns} onChange={(e) => set("handoverRules", { ...cfg.handoverRules, maxUnparsedTurns: Number(e.target.value) || 1 })} className="!w-24" />
        </Field>
        <Field label="Alert contact — mobile"><Input value={cfg.alertMobile ?? ""} onChange={(e) => set("alertMobile", e.target.value)} placeholder="+91 …" /></Field>
        <Field label="Alert contact — email"><Input value={cfg.alertEmail ?? ""} onChange={(e) => set("alertEmail", e.target.value)} placeholder="team@bagdrop.co" /></Field>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Follow-up &amp; quote automation rules</h3>
        <Field label="Delay before the first follow-up (hours)"><Input type="number" min={1} value={cfg.followUp.delayHours} onChange={(e) => set("followUp", { ...cfg.followUp, delayHours: Number(e.target.value) || 1 })} className="!w-24" /></Field>
        <Field label="Max follow-ups"><Input type="number" min={0} value={cfg.followUp.maxFollowUps} onChange={(e) => set("followUp", { ...cfg.followUp, maxFollowUps: Number(e.target.value) || 0 })} className="!w-24" /></Field>
        <Field label="Template (must have an approved WhatsApp template to work beyond 24h — see Reports/Automation desk for approval status)">
          <Select value={cfg.followUp.template} onChange={(e) => set("followUp", { ...cfg.followUp, template: e.target.value })} className="!w-56">
            <option value="quote_nudge">quote_nudge</option>
            <option value="quote_expiring">quote_expiring</option>
            <option value="follow_up">follow_up</option>
            <option value="inquiry_ack">inquiry_ack (only one currently approved)</option>
          </Select>
        </Field>
        <Field label="Max auto-quote validity (hours)"><Input type="number" min={1} value={cfg.quoteAutomation.maxAutoQuoteValidityHours} onChange={(e) => set("quoteAutomation", { ...cfg.quoteAutomation, maxAutoQuoteValidityHours: Number(e.target.value) || 1 })} className="!w-24" /></Field>
      </Card>

      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex items-center gap-3">
        <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save settings"}</Button>
        {savedAt && !saving && <span className="text-xs text-muted">Saved {istTime(savedAt)}</span>}
      </div>
    </div>
  );
}

/* ================= (C) Automation History ================= */
const EVENT_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  message_in: "muted", auto_reply: "info", welcome_sent: "info", faq_answered: "info",
  lead_created: "ok", lead_linked: "ok", quote_drafted: "ok", quote_sent: "ok",
  handover: "warn", resumed_bot: "info", resolved: "ok", opt_out: "muted",
  followup_scheduled: "info", followup_sent: "info", followup_skipped: "warn", error: "bad",
};

function AutomationHistory() {
  const [type, setType] = useState("");
  const [rows, setRows] = useState<WaEvent[]>([]);
  useEffect(() => { let dead = false; fetchHistory({ type: type || undefined }).then((l) => { if (!dead) setRows(l); }); return () => { dead = true; }; }, [type]);
  useEffect(() => {
    const t = setInterval(() => fetchHistory({ type: type || undefined }).then(setRows).catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [type]);

  return (
    <div className="grid gap-4">
      <Field label="Filter by type">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-56">
          <option value="">All events</option>
          {Object.keys(EVENT_TONE).map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <TableFrame>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs font-semibold text-muted"><th className="px-3 py-2">When</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Detail</th><th className="px-3 py-2">Conversation</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-2 text-muted">{istTime(e.at)}</td>
                <td className="px-3 py-2"><Badge tone={EVENT_TONE[e.type] ?? "muted"}>{e.type}</Badge></td>
                <td className="px-3 py-2">{e.detail}{e.error && <span className="ml-2 text-xs text-red-600">({e.error})</span>}</td>
                <td className="px-3 py-2 text-muted">{e.conversationId ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </TableFrame>
    </div>
  );
}

/* ================= module shell ================= */
export default function WhatsAppAutomation() {
  const [sub, setSub] = useState<"live" | "settings" | "history">("live");
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5">
        {([["live", "Live conversations"], ["settings", "Chatbot settings"], ["history", "Automation history"]] as const).map(([k, n]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${sub === k ? "text-white" : "hover:opacity-80"}`}
            style={sub === k ? { background: "var(--a-navy)" } : { background: "var(--a-surface-2)", color: "var(--a-muted)" }}>{n}</button>
        ))}
      </div>
      <div key={sub} className="anim-in">
        {sub === "live" && <LiveConversations />}
        {sub === "settings" && <ChatbotSettings />}
        {sub === "history" && <AutomationHistory />}
      </div>
    </div>
  );
}
