"use client";
/** Admin OS · CRM & follow-ups — ported from the static build's m-crm
 *  module (admin.js ~L1264-1335, L2381-2461, L2534-2590 + shared/ai.js).
 *  Customers aren't a stored table — computed live from bookings grouped
 *  by mobile, same as the original.
 *
 *  Leads come from the `inquiries` table, which this app has no
 *  customer-facing form writing into yet (only the static build's
 *  wedding/event pages do) — so this list is empty until that exists;
 *  the module still works against whatever rows land there.
 *
 *  Not yet ported: "Convert to wedding" (there's no Events & bulk module
 *  in this app to convert into — a lead is marked converted here
 *  instead), the outbox/gateway-keys panel, and real send automation —
 *  "nudge" actions draft a message and log it, same manual click-through
 *  the static build did (wa.me/mailto links; no provider wired there
 *  either). */
import { useEffect, useState } from "react";
import { inr } from "@/lib/pricing";
import { crmSuggestions, followedKeySet, type Customer, crmCustomers } from "@/lib/intelligence";
import { watchAdminBookings } from "@/lib/adminApi";
import { listCrmActivity, logActivity, setInquiryStatus, watchCrmActivity, watchInquiries } from "@/lib/crmApi";
import type { Booking, CrmActivity, Inquiry } from "@/lib/types";
import type { ProductionLead } from "../api/admin/production-leads/route";
import { useProductionLeads } from "@/lib/useProductionLeads";
import { Badge, Button, Card, Input } from "@/components/ui";

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

export default function CRM() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => watchInquiries(setInquiries, (e) => setErr(String(e))), []);
  useEffect(() => watchCrmActivity(setActivity, (e) => setErr(String(e))), []);

  const [suggestions, setSuggestions] = useState<ReturnType<typeof crmSuggestions> | null>(null);
  useEffect(() => {
    setSuggestions(crmSuggestions(bookings, inquiries, followedKeySet(activity)));
  }, [bookings, inquiries, activity]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => { setCustomers(crmCustomers(bookings)); }, [bookings]);
  const { leads: prodLeads } = useProductionLeads();
  const prodCust = prodCustomers(prodLeads);

  const [q, setQ] = useState("");
  const filteredCustomers = customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q));
  const filteredProdCustomers = prodCust.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q));

  const newLeads = inquiries.filter((i) => i.status === "new").length;
  const pipeline = inquiries.filter((i) => i.status === "new").reduce((a, i) => a + (i.bags || 60) * 3500 * 2, 0);
  const gold = customers.filter((c) => c.tier === "gold").length + prodCust.filter((c) => c.tier === "gold").length;
  const converted = bookings.filter((b) => b.pay).length;
  const conversion = bookings.length ? Math.round((100 * converted) / bookings.length) : 0;

  async function act(s: NonNullable<typeof suggestions>[number]) {
    await logActivity({
      text: s.text, kind: s.kind, contact: s.contact, msg: s.msg, refId: s.refId, followKey: s.followKey,
    });
    if (s.action === "convert") await setInquiryStatus(s.refId, "converted");
    setActivity(await listCrmActivity());
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="New leads" value={String(newLeads)} />
        <Kpi label="Pipeline" value={inr(pipeline)} hint="estimate" />
        <Kpi label="Gold customers" value={String(gold)} hint={`of ${customers.length + prodCust.length}`} />
        <Kpi label="Conversion" value={`${conversion}%`} />
      </div>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Suggestions <span className="font-normal text-faint">what to do next, ranked</span></h3>
        {!suggestions || suggestions.length === 0 ? (
          <p className="text-sm text-muted">Nothing needs attention right now.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-2 text-sm last:border-0">
                <div>
                  <Badge tone={s.pri === 1 ? "warn" : "info"}>{s.who}</Badge>
                  <p className="mt-1 text-xs text-muted">{s.text}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void act(s)}>{s.actionLabel}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Leads <Badge tone="ok">live</Badge></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Received</th><th className="pr-2">Lead</th><th className="pr-2">Venue · size</th><th className="pr-2">Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {inquiries.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">No inquiries yet.</td></tr>}
              {inquiries.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 text-xs text-faint">{new Date(i.created).toLocaleDateString("en-IN")}</td>
                  <td className="pr-2">{i.contact.name}<br /><span className="text-xs text-faint">{i.contact.mobile}</span></td>
                  <td className="pr-2 text-xs">{i.venue || i.venueCity || "—"} · {i.families ?? "?"} families</td>
                  <td className="pr-2"><Badge tone={i.status === "converted" ? "ok" : i.status === "lost" ? "bad" : "info"}>{i.status}</Badge></td>
                  <td className="flex gap-1.5 py-2">
                    {i.status === "new" && <Button size="sm" variant="outline" onClick={() => void setInquiryStatus(i.id, "contacted").then(() => listCrmActivity())}>Contacted</Button>}
                    {i.status !== "converted" && <Button size="sm" variant="outline" onClick={() => void setInquiryStatus(i.id, "converted")}>Convert</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">
          Customers <span className="font-normal text-faint">+ {prodCust.length} from bagdrop.co</span>
        </h3>
        <Input className="mb-3" placeholder="Search name or mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Customer</th><th className="pr-2">Tier</th><th className="pr-2 text-right">Bookings</th><th className="pr-2 text-right">Value</th><th>Last</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 && filteredProdCustomers.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">No customers yet.</td></tr>}
              {filteredCustomers.map((c) => (
                <tr key={`new:${c.mobile}`} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2">{c.name}<br /><span className="text-xs text-faint">{c.mobile}</span></td>
                  <td className="pr-2"><Badge tone={c.tier === "gold" ? "warn" : c.tier === "silver" ? "info" : "muted"}>{c.tier}</Badge></td>
                  <td className="pr-2 text-right">{c.bookings.length}</td>
                  <td className="pr-2 text-right">{inr(c.value)}</td>
                  <td className="text-xs text-faint">{c.last.from} → {c.last.to}</td>
                </tr>
              ))}
              {filteredProdCustomers.map((c) => (
                <tr key={`prod:${c.mobile}`} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2">{c.name}<br /><span className="text-xs text-faint">{c.mobile}</span></td>
                  <td className="pr-2"><Badge tone={c.tier === "gold" ? "warn" : c.tier === "silver" ? "info" : "muted"}>{c.tier}</Badge></td>
                  <td className="pr-2 text-right">{c.bookingsCount}</td>
                  <td className="pr-2 text-right">{inr(c.value)}</td>
                  <td className="text-xs text-faint">{c.lastRoute}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ActivityLog activity={activity} onLogged={setActivity} />
    </div>
  );
}

function ActivityLog({ activity, onLogged }: { activity: CrmActivity[]; onLogged: (a: CrmActivity[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try { await logActivity({ text, kind: "note" }); onLogged(await listCrmActivity()); setText(""); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Activity log</h3>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Log a call, note, or follow-up…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => void add()}>Log</Button>
      </div>
      <ul className="max-h-60 space-y-1.5 overflow-auto text-xs">
        {activity.length === 0 && <li className="text-muted">Nothing logged yet.</li>}
        {activity.map((a) => (
          <li key={a.id} className="border-b border-dashed border-line pb-1.5 last:border-0">
            <span className="text-faint">{new Date(a.created).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> — {a.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="block font-display text-xl font-extrabold">{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
