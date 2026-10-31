"use client";
/** BAGDROP OS · Clients — the client master. One record per client (mobile
 *  is the identity key): name, contact, email, address, DOB, GSTIN,
 *  category for the team, past/present/future bookings auto-linked, and
 *  every number segregated by Indian financial year. Download the template
 *  or the full export; upload old client data through a verify-first
 *  wizard where conflicts are decided row by row (or merged all at once)
 *  and nothing is ever written without an explicit commit. */
import { useCallback, useMemo, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { inr } from "@/lib/pricing";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const CATEGORIES = ["New", "Repeat", "VIP", "Wedding", "B2B", "Dormant"] as const;
const CAT_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  VIP: "ok", Repeat: "info", Wedding: "warn", B2B: "info", Dormant: "muted", New: "muted",
};

interface FyStat { fy: string; bookings: number; revenue: number }
interface ClientView {
  id: string; name: string; mobile: string; email?: string;
  address?: string; city?: string; state?: string; pincode?: string;
  dob?: string; gstin?: string; category?: string; tags?: string[]; notes?: string;
  source?: string; createdAt: string;
  autoCategory: string; effectiveCategory: string;
  bookingsPast: string[]; bookingsPresent: string[]; bookingsFuture: string[];
  bookingCount: number; lifetimeValue: number;
  firstBookingAt?: string; lastBookingAt?: string;
  fyStats: FyStat[];
}
interface PreviewRow {
  n: number; status: "new" | "match" | "conflict" | "invalid"; reason?: string;
  incoming?: ClientView; existing?: ClientView;
  diffs?: { field: string; existing: string; incoming: string }[];
}

export default function Clients() {
  const [clients, setClients] = useState<ClientView[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [fy, setFy] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/clients");
    const j = await r.json();
    if (j.error) setErr(j.error); else { setClients(j.clients); setErr(null); }
  }, []);
  useLoad(load, 30000);

  const fys = useMemo(() => [...new Set(clients.flatMap((c) => c.fyStats.map((s) => s.fy)))].sort().reverse(), [clients]);
  const needle = q.trim().toLowerCase();
  const rows = clients.filter((c) =>
    (!needle || [c.name, c.mobile, c.email, c.city].some((s) => s?.toLowerCase().includes(needle))) &&
    (!cat || c.effectiveCategory === cat) &&
    (!fy || c.fyStats.some((s) => s.fy === fy && s.bookings > 0)));

  const kpi = useMemo(() => ({
    total: clients.length,
    vip: clients.filter((c) => c.effectiveCategory === "VIP").length,
    repeat: clients.filter((c) => c.effectiveCategory === "Repeat").length,
    dormant: clients.filter((c) => c.effectiveCategory === "Dormant").length,
    value: clients.reduce((s, c) => s + c.lifetimeValue, 0),
  }), [clients]);

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Clients:</b> {err}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Clients in the master" value={String(kpi.total)} />
        <Kpi label="VIP" value={String(kpi.vip)} />
        <Kpi label="Repeat" value={String(kpi.repeat)} />
        <Kpi label="Dormant · re-activate" value={String(kpi.dormant)} warn={kpi.dormant > 0} />
        <Kpi label="Lifetime value" value={inr(kpi.value)} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-[220px] flex-1 py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name · mobile · email · city…" />
          <Select className="w-auto py-2 text-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select className="w-auto py-2 text-xs" value={fy} onChange={(e) => setFy(e.target.value)}>
            <option value="">All financial years</option>
            {fys.map((f) => <option key={f} value={f}>FY {f}</option>)}
          </Select>
          <Button size="sm" variant="outline" onClick={() => window.open("/api/admin/clients?format=csv", "_blank")}>Download master CSV</Button>
          <Button size="sm" variant="outline" onClick={() => window.open("/api/admin/clients?template=1", "_blank")}>Template CSV</Button>
          <Button size="sm" onClick={() => setShowImport((v) => !v)}>{showImport ? "Close upload" : "Upload client data"}</Button>
        </div>
      </Card>

      {showImport && <ImportWizard onDone={async () => { setShowImport(false); await load(); }} />}

      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Client master <span className="font-normal text-faint">{rows.length} shown · mobile is the identity key · bookings link automatically</span></h3>
        <div className="grid gap-2">
          {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">No clients match.</p>}
          {rows.slice(0, 60).map((c, i) => (
            <div key={c.id} className="anim-in rounded-xl border border-line" style={{ animationDelay: `${i * 20}ms` }}>
              <button className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setSel(sel === c.id ? null : c.id)}>
                <span className="min-w-0">
                  <b className="text-[13.5px]">{c.name || "—"}</b>{" "}
                  <Badge tone={CAT_TONE[c.effectiveCategory] ?? "muted"}>{c.effectiveCategory}</Badge>
                  <span className="block text-xs text-muted">+{c.mobile}{c.email ? ` · ${c.email}` : ""}{c.city ? ` · ${c.city}` : ""}</span>
                </span>
                <span className="text-right text-xs">
                  <b className="block tabular-nums">{inr(c.lifetimeValue)}</b>
                  <span className="text-muted">{c.bookingCount} booking{c.bookingCount === 1 ? "" : "s"}{c.bookingsPresent.length ? ` · ${c.bookingsPresent.length} live` : ""}{c.bookingsFuture.length ? ` · ${c.bookingsFuture.length} upcoming` : ""}</span>
                </span>
              </button>
              {sel === c.id && <ClientDetail c={c} onSaved={load} />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- one client: full record + past/present/future + FY + SMM ---------- */
function ClientDetail({ c, onSaved }: { c: ClientView; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    name: c.name, mobile: c.mobile, email: c.email ?? "", address: c.address ?? "",
    city: c.city ?? "", state: c.state ?? "", pincode: c.pincode ?? "", dob: c.dob ?? "",
    gstin: c.gstin ?? "", category: c.category ?? "", notes: c.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", record: { ...f, category: f.category || undefined } }),
      });
      const j = await r.json();
      if (j.error) setMsg(j.detail ?? j.error); else { setMsg("Saved."); await onSaved(); }
    } finally { setBusy(false); }
  }
  const wa = `https://wa.me/${c.mobile}?text=${encodeURIComponent(`Hi ${c.name.split(" ")[0]}, Bagdrop here — `)}`;
  const mail = c.email ? `mailto:${c.email}?subject=${encodeURIComponent("Bagdrop — your door-to-door baggage partner")}` : null;

  const bucket = (title: string, ids: string[], tone: "ok" | "warn" | "info") => (
    <div className="rounded-xl bg-paper p-2.5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{title} <Badge tone={tone}>{ids.length}</Badge></p>
      {ids.length === 0 ? <p className="text-[11px] text-faint">none</p> :
        ids.map((id) => <span key={id} className="mr-2 font-mono text-[11px]">{id}</span>)}
    </div>
  );

  return (
    <div className="anim-in border-t border-line p-3">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        {bucket("Past bookings", c.bookingsPast, "info")}
        {bucket("Present · in motion", c.bookingsPresent, "warn")}
        {bucket("Future · upcoming", c.bookingsFuture, "ok")}
      </div>

      {c.fyStats.length > 0 && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-line p-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">By financial year</p>
          <div className="flex flex-wrap gap-4 text-xs">
            {c.fyStats.map((s) => (
              <span key={s.fy}>FY <b>{s.fy}</b>: {s.bookings} booking{s.bookings === 1 ? "" : "s"} · <b className="tabular-nums">{inr(s.revenue)}</b></span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-x-3 sm:grid-cols-4">
        <Field label="Full name *"><Input className="py-2 text-xs" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile (identity key)"><Input className="py-2 text-xs font-mono" value={f.mobile} disabled /></Field>
        <Field label="Email"><Input className="py-2 text-xs" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Date of birth"><Input className="py-2 text-xs" type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></Field>
        <Field label="Address"><Input className="py-2 text-xs" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="City"><Input className="py-2 text-xs" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="State"><Input className="py-2 text-xs" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></Field>
        <Field label="Pincode"><Input className="py-2 text-xs" inputMode="numeric" value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} /></Field>
        <Field label="GSTIN (corporate)"><Input className="py-2 text-xs font-mono" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label={`Category (auto: ${c.autoCategory})`}>
          <Select className="py-2 text-xs" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">auto · {c.autoCategory}</option>
            {CATEGORIES.map((x) => <option key={x}>{x}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2"><Field label="Notes for the team"><Input className="py-2 text-xs" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !f.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save client"}</Button>
        <Button size="sm" variant="outline" onClick={() => window.open(wa, "_blank")}>WhatsApp →</Button>
        {mail && <Button size="sm" variant="outline" onClick={() => window.open(mail, "_blank")}>Email →</Button>}
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(`${f.name} · +${f.mobile}${f.email ? ` · ${f.email}` : ""}${f.address ? ` · ${f.address}` : ""}`)}>Copy for quote desk</Button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}

/* ---------- the verify-first upload wizard ---------- */
function ImportWizard({ onDone }: { onDone: () => Promise<void> }) {
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<{ new: number; match: number; conflict: number; invalid: number } | null>(null);
  const [choices, setChoices] = useState<Record<string, "create" | "skip" | "useUploaded" | "fillBlanks">>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function onFile(file: File) {
    void file.text().then(async (t) => {
      setBusy(true); setMsg(null);
      try {
        const lines = t.split(/\r?\n/).filter((l) => l.trim());
        const head = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
        const idx = (k: string) => head.findIndex((h) => h.includes(k));
        const cols = { name: idx("name"), mobile: idx("mobile") >= 0 ? idx("mobile") : idx("phone"), email: idx("email"), address: idx("address"), city: idx("city"), state: idx("state"), pincode: idx("pin"), dob: idx("dob") >= 0 ? idx("dob") : idx("birth"), gstin: idx("gst"), category: idx("categ"), tags: idx("tag"), notes: idx("note") };
        const parseLine = (l: string) => {
          const out: string[] = []; let cur = "", inQ = false;
          for (const ch of l) {
            if (ch === '"') inQ = !inQ;
            else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
            else cur += ch;
          }
          out.push(cur); return out.map((x) => x.trim());
        };
        const rows = lines.slice(1).map((l) => {
          const cells = parseLine(l);
          const g = (i: number) => (i >= 0 ? cells[i] : undefined);
          return { name: g(cols.name), mobile: g(cols.mobile), email: g(cols.email), address: g(cols.address), city: g(cols.city), state: g(cols.state), pincode: g(cols.pincode), dob: g(cols.dob), gstin: g(cols.gstin), category: g(cols.category), tags: g(cols.tags), notes: g(cols.notes) };
        });
        const r = await fetch("/api/admin/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "importPreview", rows }) });
        const j = await r.json();
        if (j.error) { setMsg(j.detail ?? j.error); return; }
        setPreview(j.preview); setSummary(j.summary);
        const init: Record<string, "create" | "skip" | "useUploaded" | "fillBlanks"> = {};
        for (const p of j.preview as PreviewRow[]) {
          if (p.status === "new" && p.incoming) init[p.incoming.mobile] = "create";
          if (p.status === "match" && p.incoming) init[p.incoming.mobile] = p.reason?.includes("blank") ? "fillBlanks" : "skip";
          /* conflicts start UNDECIDED — the team must choose */
        }
        setChoices(init);
      } finally { setBusy(false); }
    });
  }

  const undecided = (preview ?? []).filter((p) => p.status === "conflict" && p.incoming && !choices[p.incoming.mobile]).length;

  async function commit() {
    if (!preview) return;
    setBusy(true); setMsg(null);
    try {
      const decisions = preview
        .filter((p) => p.status !== "invalid" && p.incoming)
        .map((p) => ({ mobile: p.incoming!.mobile, choice: choices[p.incoming!.mobile] ?? "skip", record: p.incoming }));
      const r = await fetch("/api/admin/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "importCommit", decisions }) });
      const j = await r.json();
      if (j.error) { setMsg(j.detail ?? j.error); return; }
      setMsg(`Done — ${j.created} created · ${j.merged} merged · ${j.skipped} skipped. Master now holds ${j.total} saved records.`);
      setPreview(null); setSummary(null);
      await onDone();
    } finally { setBusy(false); }
  }

  const setAllConflicts = (choice: "useUploaded" | "fillBlanks" | "skip") => {
    const next = { ...choices };
    for (const p of preview ?? []) if (p.status === "conflict" && p.incoming) next[p.incoming.mobile] = choice;
    setChoices(next);
  };

  return (
    <Card className="anim-in border-l-4 border-l-[#EA580C]">
      <h3 className="mb-1 font-display text-sm font-bold">Upload client data <span className="font-normal text-faint">verify first — nothing is written until you commit</span></h3>
      {!preview && (
        <>
          <p className="mb-2 text-xs text-muted">CSV with the template headers (name, mobile, email, address, city, state, pincode, dob, gstin, category, tags, notes). Mobile is the identity key; invalid rows are rejected with the reason, conflicts wait for your decision.</p>
          <label className="inline-block cursor-pointer rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold shadow-card">
            {busy ? "Checking…" : "Choose CSV"}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
        </>
      )}
      {msg && <p className="mt-2 rounded-xl bg-paper p-2.5 text-xs">{msg}</p>}

      {preview && summary && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-3 rounded-xl bg-paper p-2.5 text-xs">
            <span>✅ New: <b>{summary.new}</b></span>
            <span>🔁 Match: <b>{summary.match}</b></span>
            <span>⚠️ Conflict: <b className={summary.conflict ? "text-amber-600" : ""}>{summary.conflict}</b></span>
            <span>❌ Invalid: <b className={summary.invalid ? "text-red-600" : ""}>{summary.invalid}</b></span>
            {summary.conflict > 0 && (
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setAllConflicts("fillBlanks")}>All: fill blanks</Button>
                <Button size="sm" variant="ghost" onClick={() => setAllConflicts("useUploaded")}>All: use uploaded</Button>
                <Button size="sm" variant="ghost" onClick={() => setAllConflicts("skip")}>All: keep existing</Button>
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto rounded-xl border border-line">
            {preview.map((p) => (
              <div key={p.n} className="border-b border-dashed border-line p-2.5 text-xs last:border-0">
                {p.status === "invalid" && <p className="text-red-700">❌ {p.reason}</p>}
                {p.status === "new" && p.incoming && (
                  <p>✅ <b>{p.incoming.name}</b> · +{p.incoming.mobile} — new client, will be created.</p>
                )}
                {p.status === "match" && p.incoming && (
                  <p>🔁 <b>{p.incoming.name}</b> · +{p.incoming.mobile} — already in the master · {p.reason}
                    {p.reason?.includes("blank") && <Select className="ml-2 inline-block w-auto !py-0.5 !text-[11px]" value={choices[p.incoming.mobile] ?? "skip"} onChange={(e) => setChoices({ ...choices, [p.incoming!.mobile]: e.target.value as never })}><option value="fillBlanks">fill the blanks</option><option value="skip">skip</option></Select>}
                  </p>
                )}
                {p.status === "conflict" && p.incoming && (
                  <div>
                    <p className="font-semibold text-amber-700">⚠️ +{p.incoming.mobile} — details differ. Decide:</p>
                    <table className="mt-1 w-full text-[11px]">
                      <thead><tr className="text-left text-[9px] uppercase text-muted"><th className="pr-2">Field</th><th className="pr-2">In master</th><th>In your file</th></tr></thead>
                      <tbody>{(p.diffs ?? []).map((d) => (
                        <tr key={d.field}><td className="pr-2 font-semibold">{d.field}</td><td className="pr-2">{d.existing}</td><td className="text-amber-700">{d.incoming}</td></tr>
                      ))}</tbody>
                    </table>
                    <Select className="mt-1 w-auto !py-1 !text-[11px]" value={choices[p.incoming.mobile] ?? ""} onChange={(e) => setChoices({ ...choices, [p.incoming!.mobile]: e.target.value as never })}>
                      <option value="" disabled>— choose —</option>
                      <option value="skip">Keep existing (skip this row)</option>
                      <option value="useUploaded">Use uploaded values</option>
                      <option value="fillBlanks">Keep existing, fill blanks only</option>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || undecided > 0} onClick={() => void commit()}>
              {busy ? "Committing…" : undecided > 0 ? `Decide ${undecided} conflict(s) first` : "Commit to the master"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setPreview(null); setSummary(null); setChoices({}); }}>Cancel</Button>
            {undecided > 0 && <span className="text-xs text-amber-700">Conflicts never merge on their own — choose for each, or use an “All:” button above.</span>}
          </div>
        </div>
      )}
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
