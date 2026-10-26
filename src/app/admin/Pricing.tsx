"use client";
/** Admin OS · Pricing engine — ported from the static build's m-price
 *  module (shared/pricing.js + admin.js ~L267-300, L1518-1700). Edits here
 *  persist to the `settings` table and are read by /api/quote and
 *  /api/admin/quotes on every request (src/lib/pricingSettings.ts) — so a
 *  saved change is live immediately for real customer quotes. The client-
 *  side booking-wizard PREVIEW still uses the static defaults (a cosmetic
 *  gap only: the server-signed figure, the one actually charged, always
 *  reflects the latest save).
 *
 *  Not yet ported: the contenteditable-grid UX and per-cell debounced
 *  autosave (this saves the chart/matrix as a whole, via an explicit Save
 *  button) — same data, simpler interaction. */
import { useEffect, useState } from "react";
import { DEFAULT_MASTERS, OVERSIZE_RATE, ZONES, inr, quote, type Masters } from "@/lib/pricing";
import { getMasters, saveExtraCities, saveMatrix, saveOversize, saveRoutes } from "@/lib/pricingApi";
import { pricingSuggestions } from "@/lib/intelligence";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking, City, Mode, RouteRate, Zone } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const EMPTY_ROUTE: RouteRate = { from: "", to: "", dir: "both", r1: 0, r2: 0, addl: 0, note: "" };

export default function Pricing() {
  const [masters, setMasters] = useState<Masters | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getMasters().then(setMasters).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const [bookings, setBookings] = useState<Booking[]>([]);
  useEffect(() => watchAdminBookings(setBookings, () => {}), []);
  const [suggestions, setSuggestions] = useState<ReturnType<typeof pricingSuggestions>>([]);
  useEffect(() => { setSuggestions(pricingSuggestions(bookings)); }, [bookings]);

  if (err) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{err}</p>;
  if (!masters) return <p className="text-sm text-muted">Loading the rate chart…</p>;

  const extraCities = masters.cities.slice(DEFAULT_MASTERS.cities.length);

  async function withMsg(fn: () => Promise<Masters>) {
    setMsg(""); setErr("");
    try { setMasters(await fn()); setMsg("Saved."); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="grid gap-5">
      {msg && <p className="rounded-xl bg-green-50 p-2 text-xs text-green-900">{msg}</p>}

      <RouteChart routes={masters.routes} onSave={(r) => void withMsg(() => saveRoutes(r))} />

      <div className="grid gap-5 lg:grid-cols-2">
        <FallbackMatrix matrix={masters.matrix} onSave={(m) => void withMsg(() => saveMatrix(m))} />
        <div className="grid gap-5">
          <Card>
            <h3 className="mb-2 font-display text-sm font-bold">Oversize add-on</h3>
            <OversizeEditor value={masters.oversizeRate} onSave={(n) => void withMsg(() => saveOversize(n))} />
          </Card>
          <CitiesEditor extraCities={extraCities} onSave={(c) => void withMsg(() => saveExtraCities(c))} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <QuoteSimulator masters={masters} />
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold">Pricing suggestions</h3>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted">No lanes currently under 20% contribution margin.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {suggestions.map((s) => (
                <li key={s.lane} className="border-b border-dashed border-line pb-2 last:border-0">
                  <Badge tone="warn">{s.lane} · {s.cm}%</Badge>
                  <p className="mt-1 text-muted">{s.text}</p>
                  <p className="mt-0.5 font-semibold text-ink">{s.impact}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function RouteChart({ routes, onSave }: { routes: RouteRate[]; onSave: (r: RouteRate[]) => void }) {
  const [rows, setRows] = useState(routes);
  useEffect(() => setRows(routes), [routes]);
  const [draft, setDraft] = useState<RouteRate>(EMPTY_ROUTE);

  const set = (i: number, patch: Partial<RouteRate>) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  const addRoute = () => {
    if (!draft.from || !draft.to || !draft.r1 || !draft.r2 || !draft.addl) return;
    setRows((p) => [...p, draft]);
    setDraft(EMPTY_ROUTE);
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Route rate chart <span className="font-normal text-faint">the master — used before the fallback matrix</span></h3>
        <Button size="sm" onClick={() => onSave(rows)}>Save route chart</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-1.5 pr-2">From</th><th className="pr-2">To</th><th className="pr-2">Dir</th>
              <th className="pr-2">1-bag</th><th className="pr-2">2-bag</th><th className="pr-2">Addl</th>
              <th className="pr-2">Bulk min</th><th className="pr-2">Bulk rate</th><th className="pr-2">Note</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-dashed border-line last:border-0">
                <td className="py-1 pr-2"><Input className="w-28" value={r.from} onChange={(e) => set(i, { from: e.target.value })} /></td>
                <td className="pr-2"><Input className="w-28" value={r.to} onChange={(e) => set(i, { to: e.target.value })} /></td>
                <td className="pr-2">
                  <Select className="w-20" value={r.dir} onChange={(e) => set(i, { dir: e.target.value as RouteRate["dir"] })}>
                    <option value="both">both</option><option value="one">one</option>
                  </Select>
                </td>
                <td className="pr-2"><Input className="w-20" type="number" value={r.r1} onChange={(e) => set(i, { r1: Number(e.target.value) })} /></td>
                <td className="pr-2"><Input className="w-20" type="number" value={r.r2} onChange={(e) => set(i, { r2: Number(e.target.value) })} /></td>
                <td className="pr-2"><Input className="w-20" type="number" value={r.addl} onChange={(e) => set(i, { addl: Number(e.target.value) })} /></td>
                <td className="pr-2"><Input className="w-16" type="number" value={r.bulkMin ?? ""} onChange={(e) => set(i, { bulkMin: e.target.value ? Number(e.target.value) : null })} /></td>
                <td className="pr-2"><Input className="w-20" type="number" value={r.bulkRate ?? ""} onChange={(e) => set(i, { bulkRate: e.target.value ? Number(e.target.value) : null })} /></td>
                <td className="pr-2"><Input className="w-28" value={r.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} /></td>
                <td><button className="text-red-700 hover:underline" onClick={() => remove(i)}>remove</button></td>
              </tr>
            ))}
            <tr>
              <td className="py-1 pr-2"><Input className="w-28" placeholder="From" value={draft.from} onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))} /></td>
              <td className="pr-2"><Input className="w-28" placeholder="To" value={draft.to} onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))} /></td>
              <td className="pr-2">
                <Select className="w-20" value={draft.dir} onChange={(e) => setDraft((p) => ({ ...p, dir: e.target.value as RouteRate["dir"] }))}>
                  <option value="both">both</option><option value="one">one</option>
                </Select>
              </td>
              <td className="pr-2"><Input className="w-20" type="number" placeholder="r1" value={draft.r1 || ""} onChange={(e) => setDraft((p) => ({ ...p, r1: Number(e.target.value) }))} /></td>
              <td className="pr-2"><Input className="w-20" type="number" placeholder="r2" value={draft.r2 || ""} onChange={(e) => setDraft((p) => ({ ...p, r2: Number(e.target.value) }))} /></td>
              <td className="pr-2"><Input className="w-20" type="number" placeholder="addl" value={draft.addl || ""} onChange={(e) => setDraft((p) => ({ ...p, addl: Number(e.target.value) }))} /></td>
              <td colSpan={2} className="pr-2" />
              <td className="pr-2"><Input className="w-28" placeholder="note" value={draft.note ?? ""} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} /></td>
              <td><Button size="sm" variant="outline" onClick={addRoute}>Add</Button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FallbackMatrix({ matrix, onSave }: { matrix: Record<Zone, number[]>; onSave: (m: Record<Zone, number[]>) => void }) {
  const [grid, setGrid] = useState(matrix);
  useEffect(() => setGrid(matrix), [matrix]);
  const setCell = (from: Zone, i: number, v: number) => setGrid((p) => ({ ...p, [from]: p[from].map((x, idx) => (idx === i ? v : x)) }));

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Fallback matrix <span className="font-normal text-faint">per-bag, when no route row matches</span></h3>
        <Button size="sm" onClick={() => onSave(grid)}>Save matrix</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr><th></th>{ZONES.map((z) => <th key={z} className="px-1 pb-1">{z}</th>)}</tr></thead>
          <tbody>
            {ZONES.map((from) => (
              <tr key={from}>
                <td className="pr-1 font-semibold">{from}</td>
                {ZONES.map((to, i) => {
                  const v = grid[from][i];
                  return (
                    <td key={to} className="px-0.5 py-0.5">
                      <input
                        type="number" value={v} onChange={(e) => setCell(from, i, Number(e.target.value))}
                        className={`w-16 rounded border px-1 py-0.5 text-right text-xs ${v < 2500 ? "" : "border-line"}`}
                        style={v < 2500 ? { borderColor: "var(--a-bad, #f87171)", background: "var(--a-bad-bg, #fef2f2)" } : undefined}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-faint">cells under ₹2,500 are highlighted — below the rate floor</p>
    </Card>
  );
}

function OversizeEditor({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <Input className="w-28" type="number" value={v} onChange={(e) => setV(Number(e.target.value))} />
      <Button size="sm" variant="outline" onClick={() => onSave(v)}>Save</Button>
      <span className="text-xs text-faint">per oversize piece (default {OVERSIZE_RATE})</span>
    </div>
  );
}

function CitiesEditor({ extraCities, onSave }: { extraCities: City[]; onSave: (c: City[]) => void }) {
  const [list, setList] = useState(extraCities);
  useEffect(() => setList(extraCities), [extraCities]);
  const [draft, setDraft] = useState<City>({ name: "", zone: "MUM", ap: "" });

  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Extra cities <span className="font-normal text-faint">on top of the built-in 20</span></h3>
      <ul className="mb-2 text-xs">
        {list.length === 0 && <li className="text-muted">None added yet.</li>}
        {list.map((c, i) => (
          <li key={c.name} className="flex justify-between border-b border-dashed border-line py-1 last:border-0">
            <span>{c.name} · {c.zone}{c.ap ? ` · ${c.ap}` : ""}</span>
            <button className="text-red-700 hover:underline" onClick={() => { const next = list.filter((_, idx) => idx !== i); setList(next); onSave(next); }}>remove</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        <Input className="w-28" placeholder="City" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
        <Select className="w-24" value={draft.zone} onChange={(e) => setDraft((p) => ({ ...p, zone: e.target.value as Zone }))}>
          {ZONES.map((z) => <option key={z}>{z}</option>)}
        </Select>
        <Input className="w-20" placeholder="AP code" value={draft.ap ?? ""} onChange={(e) => setDraft((p) => ({ ...p, ap: e.target.value }))} />
        <Button size="sm" variant="outline" onClick={() => {
          if (!draft.name || list.some((c) => c.name === draft.name)) return;
          const next = [...list, draft]; setList(next); onSave(next); setDraft({ name: "", zone: "MUM", ap: "" });
        }}>Add</Button>
      </div>
    </Card>
  );
}

function QuoteSimulator({ masters }: { masters: Masters }) {
  const [from, setFrom] = useState(masters.cities[0]?.name ?? "");
  const [to, setTo] = useState(masters.cities[1]?.name ?? "");
  const [bags, setBags] = useState(2);
  const [oversize, setOversize] = useState(0);
  const result = quote({ fromName: from, toName: to, bags, oversize, mode: "road" as Mode }, masters);

  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Quote simulator <span className="font-normal text-faint">same engine the site runs, with your live overrides</span></h3>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="From"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{masters.cities.map((c) => <option key={c.name}>{c.name}</option>)}</Select></Field>
        <Field label="To"><Select value={to} onChange={(e) => setTo(e.target.value)}>{masters.cities.map((c) => <option key={c.name}>{c.name}</option>)}</Select></Field>
        <Field label="Bags"><Input type="number" value={bags} onChange={(e) => setBags(Number(e.target.value))} /></Field>
        <Field label="Oversize"><Input type="number" value={oversize} onChange={(e) => setOversize(Number(e.target.value))} /></Field>
      </div>
      {"error" in result ? (
        <p className="text-sm text-muted">Rate on request — {result.error}</p>
      ) : (
        <p className="text-sm"><b className="font-display text-lg">{inr(result.total)}</b> <span className="text-muted">· {result.rule}</span></p>
      )}
    </Card>
  );
}
