"use client";
/** Admin OS · CRM — Zoho-class, on the same one-table document model.
 *
 *  Four desks in one module:
 *   · Pipeline — a stage board (New → Contacted → Quoted → Negotiation →
 *     Won / Lost) of lead records with value, score, age and one-tap
 *     WhatsApp/email outreach from templates; inquiries flow in as leads.
 *   · Customers — the 360° card: every booking, payment and document for a
 *     contact, computed live from bookings, with outreach and notes.
 *   · Tasks — follow-ups with owner and due date; overdue flags.
 *   · Activity — the audit trail of every touch.
 *
 *  Leads live in the existing `crm` table (kind "lead" + stage); no new
 *  tables, same admin-cookie security. Outreach is wa.me / mailto links —
 *  every send is logged; nothing goes out silently. */
import { useEffect, useMemo, useState } from "react";
import { useNow } from "@/lib/useNow";
import { inr } from "@/lib/pricing";
import { crmSuggestions, followedKeySet, type Customer, crmCustomers } from "@/lib/intelligence";
import { watchAdminBookings } from "@/lib/adminApi";
import { listCrmActivity, logActivity, markActivityDone, patchActivity, setInquiryStatus, watchCrmActivity, watchInquiries } from "@/lib/crmApi";
import type { Booking, CrmActivity, Inquiry, LeadStage } from "@/lib/types";
import type { ProductionLead } from "../api/admin/production-leads/route";
import { useProductionLeads } from "@/lib/useProductionLeads";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

/** Same grouping/tiering rule as crmCustomers() in src/lib/intelligence.ts,
 *  applied to bagdrop.co's real leads (grouped by phone) instead of this
 *  app's own bookings. */
interface ProdCustomer { mobile: string; name: string; bookingsCount: number; value: number; lastRoute: string }
function prodCustomers(leads: ProductionLead[]): (ProdCustomer & { tier: "gold" | "silver" | "prospect" })[] {
  const by: Record<string, ProdCustomer> = {};
  leads.forEach((l) => {
    const m = (l.phone || "").replace(/\D/g, "");
    if (!m) return;
    const c = (by[m] = by[m] || { mobile: l.phone, name: l.name, bookingsCount: 0, value: 0, lastRoute: `${l.fromCity ?? "—"} → ${l.toCity ?? "—"}` });
    c.name = l.name || c.name;
    c.bookingsCount += 1;
    c.value += l.booking?.totalAmount ?? 0;
  });
  return Object.values(by)
    .map((c) => {
      const tier: "gold" | "silver" | "prospect" = c.value >= 20000 || c.bookingsCount >= 3 ? "gold" : c.value > 0 ? "silver" : "prospect";
      return { ...c, tier };
    })
    .sort((a, b) => b.value - a.value);
}
type ProdCustomerRow = ReturnType<typeof prodCustomers>[number];

const STAGES: { key: LeadStage; name: string }[] = [
  { key: "new", name: "New" },
  { key: "contacted", name: "Contacted" },
  { key: "quoted", name: "Quoted" },
  { key: "negotiation", name: "Negotiation" },
  { key: "won", name: "Won" },
  { key: "lost", name: "Lost" },
];
const OPEN_STAGES: LeadStage[] = ["new", "contacted", "quoted", "negotiation"];

const TEMPLATES: { key: string; name: string; text: (n: string) => string }[] = [
  { key: "intro", name: "Introduction", text: (n) => `Hi ${n}, this is Bagdrop — door-to-door baggage across India, sealed and tracked. Sharing how it works for your route; happy to quote right away.` },
  { key: "follow", name: "Follow-up", text: (n) => `Hi ${n}, following up on your Bagdrop inquiry — shall I lock the rate and pickup slot for you? The quote stays valid 24 hours once issued.` },
  { key: "payment", name: "Payment reminder", text: (n) => `Hi ${n}, gentle reminder — your Bagdrop quote is ready to pay. The link in our last message holds your locked price. Anything in the way, tell me here.` },
  { key: "winback", name: "Win-back", text: (n) => `Hi ${n}, travelling again soon? As a past Bagdrop customer your details are already set — booking takes under two minutes.` },
];

/** Zoho-style lead score, computed live: stage depth + value + recency. */
function score(l: CrmActivity): number {
  const base: Record<string, number> = { new: 20, contacted: 35, quoted: 60, negotiation: 78, won: 100, lost: 0 };
  let s = base[l.stage ?? "new"] ?? 20;
  if ((l.value ?? 0) >= 20000) s += 10; else if ((l.value ?? 0) >= 8000) s += 5;
  const ageDays = (Date.now() - new Date(l.created).getTime()) / 86400000;
  if (ageDays < 2) s += 8; else if (ageDays > 14 && l.stage !== "won") s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const waLink = (mobile: string | undefined, text: string) =>
  `https://wa.me/${(mobile ?? "").replace(/\D/g, "").replace(/^(?!91)/, "91")}?text=${encodeURIComponent(text)}`;

/* ---------- client-master category chip ----------
 * The CRM shows at a glance who a lead already is in the Client Master
 * (VIP / Repeat / Wedding / B2B / Dormant), fetched once per page view. */
let catCache: Map<string, string> | null = null;
let catPromise: Promise<Map<string, string>> | null = null;
const norm10 = (s?: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
function loadCats(): Promise<Map<string, string>> {
  if (catCache) return Promise.resolve(catCache);
  catPromise ??= fetch("/api/admin/clients")
    .then((r) => r.json())
    .then((j) => {
      catCache = new Map((j.clients ?? []).map((c: { mobile: string; effectiveCategory: string }) => [norm10(c.mobile), c.effectiveCategory]));
      return catCache;
    })
    .catch(() => new Map());
  return catPromise;
}
const CAT_TONE: Record<string, "ok" | "warn" | "info" | "muted"> = { VIP: "ok", Repeat: "info", Wedding: "warn", B2B: "info", Dormant: "muted" };
function ClientChip({ mobile }: { mobile?: string | null }) {
  const [cat, setCat] = useState<string | null>(catCache?.get(norm10(mobile)) ?? null);
  useEffect(() => {
    let dead = false;
    void loadCats().then((m) => { if (!dead) setCat(m.get(norm10(mobile)) ?? null); });
    return () => { dead = true; };
  }, [mobile]);
  if (!cat || cat === "New" || !norm10(mobile)) return null;
  return <Badge tone={CAT_TONE[cat] ?? "muted"}>{cat} client</Badge>;
}

export default function CRM() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [desk, setDesk] = useState<"pipe" | "cust" | "task" | "log">("pipe");

  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => watchInquiries(setInquiries, (e) => setErr(String(e))), []);
  useEffect(() => watchCrmActivity(setActivity, (e) => setErr(String(e))), []);
  const refresh = async () => setActivity(await listCrmActivity());

  const leads = useMemo(() => activity.filter((a) => a.kind === "lead" && a.stage), [activity]);
  const tasks = useMemo(() => activity.filter((a) => a.dueAt), [activity]);
  const customers = useMemo(() => crmCustomers(bookings), [bookings]);
  const { leads: prodLeads } = useProductionLeads();
  const prodCust = useMemo(() => prodCustomers(prodLeads), [prodLeads]);

  const now = useNow();
  const suggestions = useMemo(() => (now ? crmSuggestions(bookings, inquiries, followedKeySet(activity)) : null), [now, bookings, inquiries, activity]);

  /* funnel + KPIs */
  const openLeads = leads.filter((l) => OPEN_STAGES.includes(l.stage!));
  const pipelineValue = openLeads.reduce((s, l) => s + (l.value ?? 0), 0);
  const won = leads.filter((l) => l.stage === "won").length;
  const winRate = leads.filter((l) => ["won", "lost"].includes(l.stage!)).length
    ? Math.round((100 * won) / leads.filter((l) => ["won", "lost"].includes(l.stage!)).length) : null;
  const overdueTasks = tasks.filter((t) => !t.doneAt && t.dueAt && now !== null && new Date(t.dueAt).getTime() < now);

  async function moveStage(l: CrmActivity, dir: 1 | -1) {
    const order: LeadStage[] = ["new", "contacted", "quoted", "negotiation", "won"];
    const i = order.indexOf(l.stage as LeadStage);
    const next = order[Math.max(0, Math.min(order.length - 1, i + dir))];
    if (next && next !== l.stage) { await patchActivity(l.id, { stage: next }); await refresh(); }
  }
  async function outreach(name: string, mobile: string | undefined, email: string | undefined, tKey: string, how: "wa" | "mail", refId?: string) {
    const t = TEMPLATES.find((x) => x.key === tKey)!;
    const text = t.text(name.split(" ")[0] || name);
    await logActivity({ text: `${how === "wa" ? "WhatsApp" : "Email"} · ${t.name} → ${name}`, kind: "customer", contact: mobile ?? email, msg: text, refId });
    if (how === "wa") window.open(waLink(mobile, text), "_blank");
    else location.href = `mailto:${email ?? ""}?subject=${encodeURIComponent("Bagdrop — " + t.name)}&body=${encodeURIComponent(text)}`;
    await refresh();
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open pipeline" value={inr(pipelineValue)} hint={`${openLeads.length} leads`} />
        <Kpi label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint={`${won} won`} />
        <Kpi label="Customers" value={String(customers.length + prodCust.length)} hint={`${customers.filter((c) => c.tier === "gold").length + prodCust.filter((c) => c.tier === "gold").length} gold · ${prodCust.length} from bagdrop.co`} />
        <Kpi label="Overdue tasks" value={String(overdueTasks.length)} warn={overdueTasks.length > 0} />
      </div>

      {/* funnel */}
      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Funnel <span className="font-normal text-faint">leads by stage · value</span></h3>
        <div className="grid gap-1.5">
          {STAGES.filter((s) => s.key !== "lost").map((s) => {
            const ls = leads.filter((l) => l.stage === s.key);
            const v = ls.reduce((a, l) => a + (l.value ?? 0), 0);
            const maxN = Math.max(1, ...STAGES.map((x) => leads.filter((l) => l.stage === x.key).length));
            return (
              <div key={s.key} className="flex items-center gap-3 text-xs">
                <span className="w-24 text-muted">{s.name}</span>
                <div className="h-5 flex-1 rounded bg-paper">
                  <div className={`h-5 rounded transition-[width] duration-500 ${s.key === "won" ? "bg-green-500/80" : "bg-brand/70"}`} style={{ width: `${(ls.length / maxN) * 100}%` }} />
                </div>
                <span className="w-24 text-right tabular-nums">{ls.length} · {inr(v)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* desk switch */}
      <div className="flex flex-wrap gap-1.5">
        {([["pipe", "Pipeline"], ["cust", "Customers 360°"], ["task", `Tasks${overdueTasks.length ? ` · ${overdueTasks.length} overdue` : ""}`], ["log", "Activity"]] as const).map(([k, n]) => (
          <button key={k} onClick={() => setDesk(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${desk === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>
            {n}
          </button>
        ))}
      </div>

      <div key={desk} className="anim-in grid gap-5">
        {desk === "pipe" && (
          <Pipeline leads={leads} inquiries={inquiries} onMove={moveStage} onOutreach={outreach}
            onLose={async (l) => { await patchActivity(l.id, { stage: "lost" }); await refresh(); }}
            onPullInquiry={async (i) => {
              await logActivity({ text: `Lead · ${i.contact.name} (${i.venue ?? i.venueCity ?? "inquiry"})`, kind: "lead", stage: "new", value: (i.bags || 40) * 3000, mobile: i.contact.mobile, email: i.contact.email, source: "inquiry", refId: i.id, contact: i.contact.mobile });
              await setInquiryStatus(i.id, "contacted"); await refresh();
            }}
            onAdd={async (d) => { await logActivity({ text: `Lead · ${d.name}`, kind: "lead", stage: "new", value: d.value, mobile: d.mobile, email: d.email, source: d.source || "direct", owner: d.owner, contact: d.mobile }); await refresh(); }} />
        )}
        {desk === "cust" && <Customers360 customers={customers} prodCustomers={prodCust} activity={activity} onOutreach={outreach} onNote={async (c, text) => { await logActivity({ text: `${c.name}: ${text}`, kind: "customer", contact: c.mobile }); await refresh(); }} />}
        {desk === "task" && <Tasks tasks={tasks} onAdd={async (text, dueAt, owner) => { await logActivity({ text, kind: "note", dueAt, owner }); await refresh(); }} onDone={async (id) => { await markActivityDone(id); await refresh(); }} />}
        {desk === "log" && (
          <Card>
            <h3 className="mb-2 font-display text-sm font-bold">Activity <span className="font-normal text-faint">every touch, newest first</span></h3>
            <ul className="max-h-96 space-y-1.5 overflow-auto text-xs">
              {activity.length === 0 && <li className="text-muted">Nothing logged yet.</li>}
              {activity.map((a) => (
                <li key={a.id} className="border-b border-dashed border-line pb-1.5 last:border-0">
                  <span className="text-faint">{new Date(a.created).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {" · "}<Badge tone={a.kind === "lead" ? "info" : a.kind === "customer" ? "ok" : "muted"}>{a.kind}</Badge> {a.text}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* suggestions stay — the copilot ranks the next best action */}
      {suggestions && suggestions.length > 0 && (
        <Card>
          <h3 className="mb-3 font-display text-sm font-bold">Suggested next actions</h3>
          <ul className="space-y-2">
            {suggestions.slice(0, 5).map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-2 text-sm last:border-0">
                <div><Badge tone={s.pri === 1 ? "warn" : "info"}>{s.who}</Badge><p className="mt-1 text-xs text-muted">{s.text}</p></div>
                <Button size="sm" variant="outline" onClick={() => void (async () => { await logActivity({ text: s.text, kind: s.kind, contact: s.contact, msg: s.msg, refId: s.refId, followKey: s.followKey }); if (s.action === "convert") await setInquiryStatus(s.refId, "converted"); await refresh(); })()}>{s.actionLabel}</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ================= pipeline board ================= */
function Pipeline({ leads, inquiries, onMove, onOutreach, onLose, onPullInquiry, onAdd }: {
  leads: CrmActivity[]; inquiries: Inquiry[];
  onMove: (l: CrmActivity, dir: 1 | -1) => Promise<void>;
  onOutreach: (name: string, mobile: string | undefined, email: string | undefined, tKey: string, how: "wa" | "mail", refId?: string) => Promise<void>;
  onLose: (l: CrmActivity) => Promise<void>;
  onPullInquiry: (i: Inquiry) => Promise<void>;
  onAdd: (d: { name: string; mobile: string; email?: string; value: number; source?: string; owner?: string }) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", mobile: "", email: "", value: "", source: "", owner: "" });
  const freshInquiries = inquiries.filter((i) => i.status === "new");

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Pipeline board</h3>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "+ New lead"}</Button>
      </div>

      {adding && (
        <Card>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} inputMode="tel" /></Field>
            <Field label="Email (optional)"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" /></Field>
            <Field label="Deal value ₹"><Input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} inputMode="numeric" /></Field>
            <Field label="Source"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">—</option><option>phone</option><option>whatsapp</option><option>referral</option><option>website</option><option>wedding</option></Select></Field>
            <Field label="Owner"><Input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="who follows up" /></Field>
          </div>
          <Button size="sm" disabled={!f.name || !f.mobile} onClick={() => void onAdd({ name: f.name, mobile: f.mobile, email: f.email || undefined, value: Number(f.value) || 0, source: f.source, owner: f.owner }).then(() => { setAdding(false); setF({ name: "", mobile: "", email: "", value: "", source: "", owner: "" }); })}>Add to pipeline</Button>
        </Card>
      )}

      {freshInquiries.length > 0 && (
        <Card>
          <h4 className="mb-2 font-display text-[13px] font-bold">Incoming inquiries <Badge tone="info">{freshInquiries.length} new</Badge></h4>
          <ul className="space-y-1.5">
            {freshInquiries.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{i.contact.name} · <span className="text-muted">{i.contact.mobile} · {i.venue ?? i.venueCity ?? "—"}</span></span>
                <Button size="sm" variant="outline" onClick={() => void onPullInquiry(i)}>Pull into pipeline</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {STAGES.map((s) => {
          const col = leads.filter((l) => l.stage === s.key).sort((a, b) => score(b) - score(a));
          return (
            <div key={s.key} className="rounded-2xl border border-line bg-paper/60 p-3 min-w-0">
              <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                {s.name} <span className="rounded-full bg-white px-2 py-0.5 tabular-nums">{col.length}</span>
              </p>
              <div className="grid gap-2">
                {col.length === 0 && <p className="py-2 text-center text-xs text-faint">empty</p>}
                {col.map((l) => {
                  const sc = score(l);
                  const name = l.text.replace(/^Lead · /, "");
                  return (
                    <div key={l.id} className="rounded-xl border border-line bg-white p-3 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <b className="font-display text-[13px]">{name}</b>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sc >= 70 ? "bg-green-50 text-green-700" : sc >= 40 ? "bg-amber-50 text-amber-700" : "bg-paper text-muted"}`}>{sc}</span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">{l.mobile ?? l.contact ?? "—"}{l.owner ? ` · ${l.owner}` : ""}{l.source ? ` · ${l.source}` : ""} <ClientChip mobile={l.mobile ?? l.contact} /></p>
                      <p className="mt-1 text-xs font-semibold tabular-nums">{inr(l.value ?? 0)} <span className="font-normal text-faint">· {Math.floor((Date.now() - new Date(l.created).getTime()) / 86400000)}d old</span></p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.key !== "new" && s.key !== "won" && s.key !== "lost" && <Button size="sm" variant="ghost" onClick={() => void onMove(l, -1)}>‹</Button>}
                        {s.key !== "won" && s.key !== "lost" && <Button size="sm" variant="outline" onClick={() => void onMove(l, 1)}>Advance ›</Button>}
                        {s.key !== "won" && s.key !== "lost" && <Button size="sm" variant="ghost" onClick={() => void onLose(l)}>Lost</Button>}
                        <Button size="sm" variant="ghost" onClick={() => void onOutreach(name, l.mobile, l.email, s.key === "quoted" ? "payment" : "follow", "wa", l.id)}>WhatsApp</Button>
                        {l.email && <Button size="sm" variant="ghost" onClick={() => void onOutreach(name, l.mobile, l.email, "follow", "mail", l.id)}>Email</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= customers 360 ================= */
function Customers360({ customers, prodCustomers, activity, onOutreach, onNote }: {
  customers: Customer[]; prodCustomers: ProdCustomerRow[]; activity: CrmActivity[];
  onOutreach: (name: string, mobile: string | undefined, email: string | undefined, tKey: string, how: "wa" | "mail") => Promise<void>;
  onNote: (c: Customer, text: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Customer | null>(null);
  const [note, setNote] = useState("");
  const list = customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q));
  const prodList = prodCustomers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q));
  const touches = sel ? activity.filter((a) => a.contact && sel.mobile.replace(/\D/g, "").includes(String(a.contact).replace(/\D/g, "").slice(-10))) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Customers</h3>
        <Input className="mb-3" placeholder="Search name or mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[28rem] overflow-auto">
          {list.length === 0 && prodList.length === 0 && <p className="py-4 text-center text-sm text-muted">No customers yet.</p>}
          {list.map((c) => (
            <button key={c.mobile} onClick={() => setSel(c)}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 border-b border-line px-1 py-2 text-left text-[13px] transition-colors last:border-0 hover:bg-paper ${sel?.mobile === c.mobile ? "bg-brand-soft" : ""}`}>
              <span>{c.name}<span className="block text-xs text-faint">{c.mobile}</span></span>
              <span className="text-right text-xs"><Badge tone={c.tier === "gold" ? "warn" : c.tier === "silver" ? "info" : "muted"}>{c.tier}</Badge><span className="mt-0.5 block tabular-nums text-muted">{inr(c.value)}</span></span>
            </button>
          ))}
          {prodList.length > 0 && (
            <>
              <p className="mt-2 border-t border-line pt-2 text-[10px] font-semibold uppercase tracking-wide text-faint">From bagdrop.co</p>
              {prodList.map((c) => (
                <div key={`prod:${c.mobile}`} className="flex w-full items-center justify-between gap-2 border-b border-line px-1 py-2 text-left text-[13px] last:border-0">
                  <span>{c.name}<span className="block text-xs text-faint">{c.mobile} · {c.lastRoute}</span></span>
                  <span className="text-right text-xs"><Badge tone={c.tier === "gold" ? "warn" : c.tier === "silver" ? "info" : "muted"}>{c.tier}</Badge><span className="mt-0.5 block tabular-nums text-muted">{inr(c.value)}</span></span>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>

      <Card>
        {!sel ? (
          <p className="py-10 text-center text-sm text-muted">Select a customer — their full history opens here: bookings, payments, documents, every conversation.</p>
        ) : (
          <div className="anim-in">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold">{sel.name}</h3>
                <p className="text-xs text-muted">{sel.mobile} · {sel.bookings.length} bookings · {sel.pieces} pieces · lifetime {inr(sel.value)}</p>
              </div>
              <Badge tone={sel.tier === "gold" ? "warn" : sel.tier === "silver" ? "info" : "muted"}>{sel.tier}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => <Button key={t.key} size="sm" variant="outline" onClick={() => void onOutreach(sel.name, sel.mobile, sel.last.traveller.email, t.key, "wa")}>{t.name} →</Button>)}
            </div>
            <h4 className="mt-4 mb-1.5 font-display text-[13px] font-bold">Bookings</h4>
            <div className="max-h-44 overflow-auto">
              {sel.bookings.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-xs last:border-0">
                  <span className="font-mono text-[11px]">{b.id}</span>
                  <span className="text-muted">{b.from} → {b.to} · {b.date}</span>
                  <span className="tabular-nums">{b.pay ? inr(b.pay.amount) : b.quote.breakdown.ror ? "ROR" : inr(b.quote.total)}</span>
                  <Badge tone={b.status === "delivered" ? "ok" : ["rejected", "cancelled"].includes(b.status) ? "bad" : "info"}>{b.status.replace("_", " ")}</Badge>
                  <span className="text-faint">{b.docs?.length ? `${b.docs.length} docs` : ""}</span>
                </div>
              ))}
            </div>
            <h4 className="mt-4 mb-1.5 font-display text-[13px] font-bold">Conversations &amp; notes</h4>
            <div className="max-h-32 overflow-auto text-xs">
              {touches.length === 0 && <p className="text-muted">No touches logged yet.</p>}
              {touches.map((t) => (
                <p key={t.id} className="border-b border-dashed border-line py-1 last:border-0">
                  <span className="text-faint">{new Date(t.created).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span> — {t.text}
                </p>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input placeholder="Add a note to this customer…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { void onNote(sel, note.trim()); setNote(""); } }} />
              <Button size="sm" disabled={!note.trim()} onClick={() => { void onNote(sel, note.trim()); setNote(""); }}>Log</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= tasks ================= */
function Tasks({ tasks, onAdd, onDone }: { tasks: CrmActivity[]; onAdd: (text: string, dueAt: string, owner: string) => Promise<void>; onDone: (id: string) => Promise<void> }) {
  const [f, setF] = useState({ text: "", due: "", owner: "" });
  const [now] = useState(() => Date.now());
  const open = tasks.filter((t) => !t.doneAt).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const done = tasks.filter((t) => t.doneAt).slice(0, 8);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Open tasks</h3>
        <div className="mb-3 grid gap-x-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input placeholder="Task — call, send quote, collect payment…" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
          <Input type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          <Input placeholder="Owner" className="sm:w-28" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          <Button size="sm" disabled={!f.text || !f.due} onClick={() => void onAdd(f.text, new Date(f.due).toISOString(), f.owner).then(() => setF({ text: "", due: "", owner: "" }))}>Add</Button>
        </div>
        <ul className="space-y-2">
          {open.length === 0 && <li className="text-sm text-muted">Nothing open. 🎉</li>}
          {open.map((t) => {
            const late = t.dueAt && new Date(t.dueAt).getTime() < now;
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-2 text-xs last:border-0">
                <span>{t.text}{t.owner ? <span className="text-faint"> · {t.owner}</span> : null}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={late ? "bad" : "info"}>{late ? "overdue · " : "due "}{new Date(t.dueAt!).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Badge>
                  <Button size="sm" variant="outline" onClick={() => void onDone(t.id)}>Done</Button>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Recently completed</h3>
        <ul className="space-y-1.5 text-xs">
          {done.length === 0 && <li className="text-muted">None yet.</li>}
          {done.map((t) => <li key={t.id} className="text-muted line-through decoration-stone-300">{t.text}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`block font-display text-xl font-extrabold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
