"use client";
/** Admin OS · Lead import (Ads) — upload Meta Lead Ads / Google Ads lead
 *  exports (CSV). Known headers map themselves; anything else is remapped by
 *  hand in the mapper row. On import, every lead whose route is on the rate
 *  masters gets an AUTO-GENERATED SIGNED QUOTE and its payment-link
 *  WhatsApp+email pair; routes we don't price yet land in the
 *  Pending-rates queue — feed the lane's rates there and the whole queue
 *  releases with fresh quotes. Nothing is ever priced by guesswork. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { watchCrmActivity } from "@/lib/crmApi";
import type { CrmActivity } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

/* ---------- CSV parsing (quotes, commas, CRLF) ---------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/* ---------- field model + auto-mapping for Meta / Google exports ---------- */
const FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "mobile", label: "Mobile", required: true },
  { key: "email", label: "Email", required: false },
  { key: "fromName", label: "From city", required: true },
  { key: "toName", label: "To city", required: true },
  { key: "bags", label: "Bags", required: false },
  { key: "date", label: "Travel date", required: false },
  { key: "campaign", label: "Campaign", required: false },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const AUTO: Record<FieldKey, string[]> = {
  name: ["full name", "full_name", "name", "lead name"],
  mobile: ["phone", "phone_number", "phone number", "mobile", "contact"],
  email: ["email", "e-mail", "email_address"],
  fromName: ["from", "from city", "pickup city", "origin", "from_city", "pickup"],
  toName: ["to", "to city", "destination", "drop city", "to_city", "drop"],
  bags: ["bags", "no of bags", "pieces", "bag count", "how many bags"],
  date: ["date", "travel date", "travel_date", "when", "departure"],
  campaign: ["campaign", "campaign_name", "campaign name", "ad set", "adset_name", "ad_name"],
};
function autoMap(headers: string[]): Record<FieldKey, number> {
  const low = headers.map((h) => h.trim().toLowerCase());
  const map = {} as Record<FieldKey, number>;
  for (const f of FIELDS) {
    map[f.key] = low.findIndex((h) => AUTO[f.key].some((a) => h === a || h.includes(a)));
  }
  return map;
}

export default function LeadImport() {
  const [desk, setDesk] = useState<"imp" | "rates">("imp");
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  useEffect(() => watchCrmActivity(setActivity, () => {}), []);
  const pendingLeads = useMemo(() => activity.filter((a) => a.ratePending && a.route), [activity]);
  const adLeads = useMemo(() => activity.filter((a) => a.kind === "lead" && (a.source === "meta-ads" || a.source === "google-ads")), [activity]);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ads leads (all time)" value={String(adLeads.length)} />
        <Kpi label="Auto-quoted" value={String(adLeads.filter((a) => a.quoteInfo).length)} />
        <Kpi label="Pending rates" value={String(pendingLeads.length)} warn={pendingLeads.length > 0} />
        <Kpi label="Pipeline value" value={inr(adLeads.reduce((s, a) => s + (a.value ?? 0), 0))} />
      </div>
      <div className="flex gap-1.5">
        {([["imp", "Import leads"], ["rates", `Pending rates${pendingLeads.length ? ` · ${pendingLeads.length}` : ""}`]] as const).map(([k, n]) => (
          <button key={k} onClick={() => setDesk(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${desk === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{n}</button>
        ))}
      </div>
      <div key={desk} className="anim-in">
        {desk === "imp" ? <Importer /> : <PendingRates leads={pendingLeads} />}
      </div>
    </div>
  );
}

/* ================= importer ================= */
function Importer() {
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<FieldKey, number> | null>(null);
  const [source, setSource] = useState("meta-ads");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const onFile = useCallback((file: File) => {
    file.text().then((t) => {
      const all = parseCsv(t);
      if (all.length < 2) { setResult("That file has no data rows."); return; }
      setHeaders(all[0]); setRows(all.slice(1)); setMap(autoMap(all[0])); setResult(null);
    });
  }, []);

  const mapped = useMemo(() => {
    if (!map) return [];
    return rows.map((r) => {
      const get = (k: FieldKey) => (map[k] >= 0 ? (r[map[k]] ?? "").trim() : "");
      return {
        name: get("name"), mobile: get("mobile"), email: get("email") || undefined,
        fromName: get("fromName"), toName: get("toName"),
        bags: Number(get("bags")) || 2, date: get("date") || undefined,
        campaign: get("campaign") || undefined, source,
      };
    });
  }, [rows, map, source]);
  const ready = useMemo(() => mapped.filter((m) => m.name && m.mobile.replace(/\D/g, "").length >= 10 && m.fromName && m.toName).length, [mapped]);

  async function runImport() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", rows: mapped }) });
      const j = await r.json();
      setResult(j.error ? `Import failed: ${j.error}` :
        `Imported ${j.total} rows → ${j.quoted} auto-quoted with signed payment links (message pairs queued) · ${j.pending} pending rates · ${j.skipped} duplicates skipped · ${j.invalid} invalid`);
      if (!j.error) { setRows([]); setHeaders([]); setMap(null); }
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-4">
      {!rows.length ? (
        <Card>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            className={`grid place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${drag ? "border-brand bg-brand-soft" : "border-line"}`}>
            <p className="font-display text-base font-bold">Drop the lead export here</p>
            <p className="mt-1 max-w-md text-sm text-muted">CSV from Meta Lead Ads or Google Ads lead forms. Columns are recognised automatically; anything odd you remap in one click.</p>
            <label className="mt-4 cursor-pointer rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white">
              Choose file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </label>
          </div>
          {result && <p className="mt-3 rounded-xl bg-paper p-3 text-sm">{result}</p>}
        </Card>
      ) : (
        <>
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold">Map the columns <span className="font-normal text-faint">{rows.length} rows · {ready} importable</span></h3>
              <Select className="w-40 py-2 text-xs" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="meta-ads">Meta Lead Ads</option>
                <option value="google-ads">Google Ads</option>
              </Select>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-4">
              {FIELDS.map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                  <Select value={String(map?.[f.key] ?? -1)} onChange={(e) => setMap((m) => ({ ...m!, [f.key]: Number(e.target.value) }))}>
                    <option value="-1">— not in file —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `column ${i + 1}`}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 font-display text-sm font-bold">Preview <span className="font-normal text-faint">first 8</span></h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted">{FIELDS.map((f) => <th key={f.key} className="py-1.5 pr-2">{f.label}</th>)}</tr></thead>
                <tbody>
                  {mapped.slice(0, 8).map((m, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5 pr-2">{m.name || <i className="text-red-500">missing</i>}</td>
                      <td className="pr-2">{m.mobile || <i className="text-red-500">missing</i>}</td>
                      <td className="pr-2 text-muted">{m.email ?? "—"}</td>
                      <td className="pr-2">{m.fromName || <i className="text-red-500">missing</i>}</td>
                      <td className="pr-2">{m.toName || <i className="text-red-500">missing</i>}</td>
                      <td className="pr-2">{m.bags}</td>
                      <td className="pr-2 text-muted">{m.date ?? "—"}</td>
                      <td className="text-muted">{m.campaign ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button disabled={busy || ready === 0} onClick={() => void runImport()}>{busy ? "Importing…" : `Import ${ready} leads → auto-quote`}</Button>
              <Button variant="ghost" onClick={() => { setRows([]); setHeaders([]); setMap(null); }}>Discard file</Button>
              <span className="text-xs text-faint">Matched routes get a signed quote + payment link instantly; unmatched go to Pending rates. Duplicate open leads are skipped.</span>
            </div>
            {result && <p className="mt-3 rounded-xl bg-paper p-3 text-sm">{result}</p>}
          </Card>
        </>
      )}
    </div>
  );
}

/* ================= pending rates ================= */
function PendingRates({ leads }: { leads: CrmActivity[] }) {
  const lanes = useMemo(() => {
    const g = new Map<string, CrmActivity[]>();
    leads.forEach((l) => { const k = `${l.route!.from} → ${l.route!.to}`; g.set(k, [...(g.get(k) ?? []), l]); });
    return [...g.entries()];
  }, [leads]);
  const [form, setForm] = useState<{ lane: string | null; r1: string; r2: string; addl: string; busy: boolean; msg: string | null; confirm?: boolean }>({ lane: null, r1: "", r2: "", addl: "", busy: false, msg: null });

  async function feedAndRelease(lane: string) {
    const [from, to] = lane.split(" → ");
    setForm((f) => ({ ...f, busy: true, msg: null }));
    try {
      // 1) add the route through the Pricing engine's controls: checked,
      //    versioned and logged like any other price change
      const save = await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "quickAdd", confirm: !!form.confirm, note: `New route ${from} ↔ ${to} for imported ad leads`,
        route: { from, to, dir: "both", r1: Number(form.r1) || 0, r2: Number(form.r2) || 0, addl: Number(form.addl) || 0, bulkMin: null, bulkRate: null },
      }) });
      const sj = await save.json().catch(() => ({}));
      if (sj.error === "NEEDS_CONFIRM") {
        setForm((f) => ({ ...f, busy: false, confirm: true, msg: `Check before adding: ${(sj.issues ?? []).map((i: { msg: string }) => i.msg).join(" · ")}` }));
        return;
      }
      if (!save.ok) throw new Error(`${sj.detail ?? sj.error ?? "rate save failed"}${sj.issues ? " — " + sj.issues.filter((i: { level: string }) => i.level === "error").map((i: { msg: string }) => i.msg).join(" · ") : ""}`);
      // 2) release the queue — every pending lead on the lane gets its signed quote now
      const rel = await fetch("/api/admin/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "release", lane: { from, to } }) }).then((r) => r.json());
      setForm({ lane: null, r1: "", r2: "", addl: "", busy: false, msg: rel.error ? `Release failed: ${rel.error}` : `Rate saved · ${rel.released} lead${rel.released === 1 ? "" : "s"} quoted and messaged automatically.` });
    } catch (e) {
      setForm((f) => ({ ...f, busy: false, msg: String(e) }));
    }
  }

  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">Pending rates <span className="font-normal text-faint">routes the chart doesn&apos;t price yet — feed the lane, the queue quotes itself</span></h3>
      {form.msg && <p className="mb-2 rounded-xl bg-green-50 p-2.5 text-xs text-green-900">{form.msg}</p>}
      {lanes.length === 0 && <p className="py-4 text-sm text-muted">Nothing pending. Every imported lead is on a priced route. ✅</p>}
      <div className="grid gap-2">
        {lanes.map(([lane, ls]) => (
          <div key={lane} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm"><b className="font-display">{lane}</b> <Badge tone="warn">{ls.length} lead{ls.length === 1 ? "" : "s"} waiting</Badge></span>
              <Button size="sm" variant="outline" onClick={() => setForm({ lane: form.lane === lane ? null : lane, r1: "", r2: "", addl: "", busy: false, msg: null })}>
                {form.lane === lane ? "Close" : "Feed rate →"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted">{ls.slice(0, 4).map((l) => l.text.replace(/^Lead · /, "")).join(" · ")}{ls.length > 4 ? ` · +${ls.length - 4} more` : ""}</p>
            {form.lane === lane && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-paper p-2.5">
                <Field label="1 bag ₹"><Input className="w-24 py-2 text-xs" inputMode="numeric" value={form.r1} onChange={(e) => setForm({ ...form, r1: e.target.value, confirm: false })} /></Field>
                <Field label="2 bags total ₹"><Input className="w-24 py-2 text-xs" inputMode="numeric" value={form.r2} onChange={(e) => setForm({ ...form, r2: e.target.value, confirm: false })} /></Field>
                <Field label="Each addl ₹"><Input className="w-24 py-2 text-xs" inputMode="numeric" value={form.addl} onChange={(e) => setForm({ ...form, addl: e.target.value, confirm: false })} /></Field>
                <Button size="sm" disabled={form.busy || !form.r1 || !form.r2 || !form.addl} onClick={() => void feedAndRelease(lane)}>
                  {form.busy ? "Releasing…" : form.confirm ? "Confirm & release queue" : "Save rate & release queue"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`block font-display text-xl font-extrabold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</span>
    </Card>
  );
}
