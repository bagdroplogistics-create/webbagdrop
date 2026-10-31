"use client";
/** Admin OS · Reports & MIS — six analyst views computed live from the one
 *  database, each shareable as a WhatsApp/email digest. Charts are drawn in
 *  the admin-os design system with motion (bar growth, crossfade on switch). */
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { watchAdminBookings } from "@/lib/adminApi";
import { watchCrmActivity } from "@/lib/crmApi";
import { marginPct, opsOf, sixSigma } from "@/lib/opsModel";
import type { Booking, CrmActivity } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import { isPaid, paidAmount } from "@/lib/payState";

const REPORTS = [
  ["funnel", "Conversion funnel"], ["lanes", "Lane P&L heatmap"], ["ads", "Ads ROI"],
  ["cohort", "Repeat customers"], ["aging", "Receivables aging"], ["sla", "Ops SLA & sigma"],
] as const;
type RKey = (typeof REPORTS)[number][0];

export default function Reports() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [r, setR] = useState<RKey>("funnel");
  useEffect(() => watchAdminBookings(setBookings, () => {}), []);
  useEffect(() => watchCrmActivity(setActivity, () => {}), []);

  const digest = (title: string, lines: string[]) => {
    const t = [`*BAGDROP · ${title}*`, `_as of ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}_`, "", ...lines].join("\n");
    return {
      wa: () => window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank"),
      mail: () => { location.href = `mailto:?subject=${encodeURIComponent("Bagdrop · " + title)}&body=${encodeURIComponent(t.replace(/\*/g, ""))}`; },
      copy: () => navigator.clipboard?.writeText(t).catch(() => {}),
    };
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-1.5">
        {REPORTS.map(([k, n]) => (
          <button key={k} onClick={() => setR(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${r === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{n}</button>
        ))}
      </div>
      <div key={r} className="anim-in">
        {r === "funnel" && <Funnel bookings={bookings} activity={activity} digest={digest} />}
        {r === "lanes" && <Lanes bookings={bookings} digest={digest} />}
        {r === "ads" && <Ads activity={activity} bookings={bookings} digest={digest} />}
        {r === "cohort" && <Cohort bookings={bookings} digest={digest} />}
        {r === "aging" && <Aging bookings={bookings} digest={digest} />}
        {r === "sla" && <Sla bookings={bookings} digest={digest} />}
      </div>
    </div>
  );
}

type Digest = (title: string, lines: string[]) => { wa: () => void; mail: () => void; copy: () => void };
function Share({ d }: { d: ReturnType<Digest> }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" onClick={d.wa}>Share on WhatsApp</Button>
      <Button size="sm" variant="outline" onClick={d.mail}>Email</Button>
      <Button size="sm" variant="ghost" onClick={d.copy}>Copy</Button>
    </div>
  );
}
function HBar({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone?: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="font-semibold tabular-nums">{text}</span></div>
      <div className="mt-1 h-4 rounded-md bg-paper">
        <div className={`h-4 rounded-md transition-[width] duration-700 ${tone ?? "bg-brand/70"}`} style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} />
      </div>
    </div>
  );
}

/* ---------- 1 · funnel ---------- */
function Funnel({ bookings, activity, digest }: { bookings: Booking[]; activity: CrmActivity[]; digest: Digest }) {
  const leads = activity.filter((a) => a.kind === "lead").length + bookings.filter((b) => !activity.some((a) => a.refId === b.id)).length;
  const quoted = bookings.filter((b) => b.quote.qid || b.quote.breakdown.ror).length;
  const paid = bookings.filter((b) => isPaid(b)).length;
  const delivered = bookings.filter((b) => b.status === "delivered").length;
  const steps = [["Leads", leads], ["Quoted", quoted], ["Paid", paid], ["Delivered", delivered]] as const;
  const conv = (a: number, b: number) => (a ? Math.round((100 * b) / a) : 0);
  const d = digest("Conversion funnel", steps.map(([n, v]) => `${n}: ${v}`).concat([`Lead → paid: ${conv(leads, paid)}%`]));
  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Conversion funnel <span className="font-normal text-faint">lead → quoted → paid → delivered</span></h3>
      {steps.map(([n, v], i) => <HBar key={n} label={`${n}${i > 0 ? ` · ${conv(Number(steps[i - 1][1]), Number(v))}% of previous` : ""}`} value={Number(v)} max={Number(steps[0][1])} text={String(v)} tone={i === steps.length - 1 ? "bg-green-500/80" : undefined} />)}
      <p className="mt-2 text-xs text-muted">Overall lead → paid conversion: <b>{conv(leads, paid)}%</b> · paid → delivered: <b>{conv(paid, delivered)}%</b></p>
      <Share d={d} />
    </Card>
  );
}

/* ---------- 2 · lane heatmap ---------- */
function Lanes({ bookings, digest }: { bookings: Booking[]; digest: Digest }) {
  const lanes = useMemo(() => {
    const m = new Map<string, { n: number; rev: number; margins: number[] }>();
    bookings.filter((b) => isPaid(b)).forEach((b) => {
      const k = `${b.from} → ${b.to}`;
      const l = m.get(k) ?? { n: 0, rev: 0, margins: [] };
      l.n++; l.rev += b.pay!.amount;
      const mg = marginPct(b); if (mg !== null) l.margins.push(mg);
      m.set(k, l);
    });
    return [...m.entries()].map(([lane, l]) => ({ lane, ...l, margin: l.margins.length ? Math.round(l.margins.reduce((s, v) => s + v, 0) / l.margins.length) : null }))
      .sort((a, b) => b.rev - a.rev);
  }, [bookings]);
  const d = digest("Lane P&L", lanes.slice(0, 6).map((l) => `${l.lane}: ${inr(l.rev)} (${l.n}) · GM ${l.margin ?? "—"}%`));
  const cell = (m: number | null) => m === null ? "bg-paper text-muted" : m >= 60 ? "bg-green-50 text-green-800" : m >= 40 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Lane P&amp;L heatmap <span className="font-normal text-faint">paid bookings · margin needs ops costs logged</span></h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Lane</th><th className="text-right">Bookings</th><th className="text-right">Revenue</th><th className="text-right">Avg GM</th></tr></thead>
          <tbody>
            {lanes.length === 0 && <tr><td colSpan={4} className="py-3 text-muted">No paid bookings yet.</td></tr>}
            {lanes.map((l) => (
              <tr key={l.lane} className="border-t border-line">
                <td className="py-1.5">{l.lane}</td><td className="text-right">{l.n}</td>
                <td className="text-right font-semibold tabular-nums">{inr(l.rev)}</td>
                <td className="text-right"><span className={`rounded-md px-2 py-0.5 font-bold ${cell(l.margin)}`}>{l.margin === null ? "no costs" : `${l.margin}%`}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Share d={d} />
    </Card>
  );
}

/* ---------- 3 · ads ROI ---------- */
function Ads({ activity, bookings, digest }: { activity: CrmActivity[]; bookings: Booking[]; digest: Digest }) {
  const rows = useMemo(() => {
    const m = new Map<string, { leads: number; quoted: number; paid: number; rev: number }>();
    activity.filter((a) => a.kind === "lead").forEach((a) => {
      const k = a.campaign ? `${a.source} · ${a.campaign}` : (a.source ?? "unknown");
      const r = m.get(k) ?? { leads: 0, quoted: 0, paid: 0, rev: 0 };
      r.leads++;
      if (a.quoteInfo || a.stage === "quoted") r.quoted++;
      const bk = bookings.find((b) => b.id === a.refId);
      if (bk && isPaid(bk)) { r.paid++; r.rev += paidAmount(bk); }
      m.set(k, r);
    });
    return [...m.entries()].sort((a, b) => b[1].rev - a[1].rev);
  }, [activity, bookings]);
  const d = digest("Ads ROI", rows.map(([k, r]) => `${k}: ${r.leads} leads · ${r.quoted} quoted · ${r.paid} paid · ${inr(r.rev)}`));
  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Ads ROI <span className="font-normal text-faint">by source · campaign — revenue traced lead-to-rupee</span></h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Source · campaign</th><th className="text-right">Leads</th><th className="text-right">Quoted</th><th className="text-right">Paid</th><th className="text-right">Revenue</th><th className="text-right">Lead→paid</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="py-3 text-muted">No sourced leads yet — import an ads CSV in Lead import.</td></tr>}
            {rows.map(([k, r]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5">{k}</td><td className="text-right">{r.leads}</td><td className="text-right">{r.quoted}</td>
                <td className="text-right">{r.paid}</td><td className="text-right font-semibold tabular-nums">{inr(r.rev)}</td>
                <td className="text-right">{r.leads ? Math.round((100 * r.paid) / r.leads) + "%" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Share d={d} />
    </Card>
  );
}

/* ---------- 4 · cohorts ---------- */
function Cohort({ bookings, digest }: { bookings: Booking[]; digest: Digest }) {
  const byMobile = useMemo(() => {
    const m = new Map<string, Booking[]>();
    bookings.forEach((b) => { const k = (b.traveller.mobile ?? "").replace(/\D/g, "").slice(-10); if (k) m.set(k, [...(m.get(k) ?? []), b]); });
    return [...m.values()];
  }, [bookings]);
  const once = byMobile.filter((l) => l.length === 1).length;
  const repeat = byMobile.filter((l) => l.length >= 2).length;
  const gold = byMobile.filter((l) => l.reduce((s, b) => s + paidAmount(b), 0) >= 20000 || l.length >= 3).length;
  const repeatRev = byMobile.filter((l) => l.length >= 2).reduce((s, l) => s + l.reduce((x, b) => x + paidAmount(b), 0), 0);
  const d = digest("Repeat customers", [`Customers: ${byMobile.length}`, `One-time: ${once}`, `Repeat: ${repeat} (${byMobile.length ? Math.round((100 * repeat) / byMobile.length) : 0}%)`, `Gold: ${gold}`, `Repeat revenue: ${inr(repeatRev)}`]);
  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Repeat customers <span className="font-normal text-faint">retention is the cheapest lead you&apos;ll ever buy</span></h3>
      <HBar label="One-time customers" value={once} max={byMobile.length} text={String(once)} />
      <HBar label="Repeat (2+ bookings)" value={repeat} max={byMobile.length} text={`${repeat} · ${byMobile.length ? Math.round((100 * repeat) / byMobile.length) : 0}%`} tone="bg-green-500/80" />
      <HBar label="Gold tier" value={gold} max={byMobile.length} text={String(gold)} tone="bg-amber-400/80" />
      <p className="mt-2 text-xs text-muted">Revenue from repeat customers: <b>{inr(repeatRev)}</b></p>
      <Share d={d} />
    </Card>
  );
}

/* ---------- 5 · receivables aging ---------- */
function Aging({ bookings, digest }: { bookings: Booking[]; digest: Digest }) {
  const [now] = useState(() => Date.now());
  const open = bookings.filter((b) => b.pay?.status !== "captured" && b.quote.total > 0 && !["rejected", "cancelled"].includes(b.status));
  const buckets = [["0–24 h", 0, 1], ["1–3 d", 1, 3], ["3–7 d", 3, 7], ["7+ d", 7, 10000]] as const;
  const val = (lo: number, hi: number) => open.filter((b) => { const dd = (now - new Date(b.created).getTime()) / 86400000; return dd >= lo && dd < hi; }).reduce((s, b) => s + b.quote.total, 0);
  const unrecon = bookings.filter((b) => b.pay?.status === "captured" && !b.pay.recon);
  const d = digest("Receivables aging", buckets.map(([n, lo, hi]) => `${n}: ${inr(val(lo, hi))}`).concat([`Unreconciled captures: ${unrecon.length} (${inr(unrecon.reduce((s, b) => s + b.pay!.amount, 0))})`]));
  const max = Math.max(1, ...buckets.map(([, lo, hi]) => val(lo, hi)));
  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Receivables aging <span className="font-normal text-faint">open quote value by age · the cadence engine chases these</span></h3>
      {buckets.map(([n, lo, hi]) => <HBar key={n} label={n} value={val(lo, hi)} max={max} text={inr(val(lo, hi))} tone={lo >= 3 ? "bg-red-400/80" : undefined} />)}
      <p className="mt-2 text-xs text-muted">Captured but unreconciled: <b>{unrecon.length}</b> payments · {inr(unrecon.reduce((s, b) => s + b.pay!.amount, 0))}</p>
      <Share d={d} />
    </Card>
  );
}

/* ---------- 6 · ops SLA ---------- */
function Sla({ bookings, digest }: { bookings: Booking[]; digest: Digest }) {
  const sigma = sixSigma(bookings);
  const withTags = bookings.filter((b) => (opsOf(b).tags?.length ?? 0) > 0);
  const scanGated = withTags.reduce((s, b) => s + Object.values(opsOf(b).scans ?? {}).reduce((x, arr) => x + arr.length, 0), 0);
  const expected = withTags.reduce((s, b) => s + (opsOf(b).tags!.length * Object.keys(opsOf(b).milestones ?? {}).filter((k) => ["picked", "inscan", "arrive", "pod"].includes(k)).length), 0);
  const compliance = expected ? Math.round((100 * scanGated) / expected) : null;
  const delivered = bookings.filter((b) => b.status === "delivered");
  const pods = delivered.filter((b) => b.pod || opsOf(b).milestones?.pod).length;
  const d = digest("Ops SLA & sigma", [`Sigma: ${sigma.sigma}σ · DPMO ${sigma.dpmo} (${sigma.opportunities} opportunities)`, `Scan compliance: ${compliance ?? "—"}%`, `POD coverage: ${delivered.length ? Math.round((100 * pods) / delivered.length) : 0}% of ${delivered.length} delivered`, `Open exceptions: ${sigma.defects}`]);
  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Ops SLA &amp; sigma <span className="font-normal text-faint">prevention measured, not promised</span></h3>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Sigma level", sigma.opportunities ? `${sigma.sigma}σ` : "—"], ["DPMO", sigma.opportunities ? String(sigma.dpmo) : "—"], ["Scan compliance", compliance === null ? "—" : `${compliance}%`], ["Open exceptions", String(sigma.defects)]] as const).map(([n, v]) => (
          <div key={n} className="rounded-xl border border-line p-3"><span className="block text-[11px] text-muted">{n}</span><span className="font-display text-xl font-extrabold tabular-nums">{v}</span></div>
        ))}
      </div>
      <HBar label={`POD coverage (${pods}/${delivered.length} delivered)`} value={pods} max={Math.max(1, delivered.length)} text={delivered.length ? Math.round((100 * pods) / delivered.length) + "%" : "—"} tone="bg-green-500/80" />
      {sigma.defects > 0 && <p className="mt-2 text-xs text-red-600"><Badge tone="bad">act</Badge> {sigma.defects} open exception{sigma.defects > 1 ? "s" : ""} — every one is a counted defect until resolved.</p>}
      <Share d={d} />
    </Card>
  );
}
