"use client";
/** Admin OS · Quotes & payments — make a quote for an inquiry that reached
 *  the team by phone/WhatsApp/walk-in/partner (not the self-serve website
 *  wizard), get a shareable payment link, and track every open quote until
 *  it's paid. Same pricing engine and signed-quote model as the website —
 *  see src/app/api/admin/quotes/route.ts. */
import { useEffect, useMemo, useState } from "react";
import { CITIES, inr, quote } from "@/lib/pricing";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking, Mode, UseCase } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const SERVICES: { uc: UseCase; mode: Mode; title: string }[] = [
  { uc: "d2a", mode: "air", title: "Home → Airport" },
  { uc: "a2d", mode: "air", title: "Airport → Home" },
  { uc: "h2a", mode: "air", title: "Hotel → Airport" },
  { uc: "h2h", mode: "road", title: "Hotel → Hotel" },
  { uc: "d2d", mode: "road", title: "Door → Door" },
  { uc: "rail", mode: "rail", title: "Railway station" },
  { uc: "cruise", mode: "sea", title: "Cruise terminal" },
];

interface Draft {
  title: string; name: string; mobile: string; email: string; res: "in" | "intl";
  uc: UseCase; mode: Mode; fromName: string; toName: string;
  pickAddr: string; dropAddr: string; date: string; flight: string;
  bags: number; oversize: number; note: string; validHours: 24 | 48 | 168;
}

const EMPTY: Draft = {
  title: "Mr.", name: "", mobile: "", email: "", res: "in",
  uc: "d2a", mode: "air", fromName: "Ahmedabad", toName: "Mumbai",
  pickAddr: "", dropAddr: "", date: "", flight: "",
  bags: 2, oversize: 0, note: "", validHours: 24,
};

export default function QuotesAndPayments() {
  const [all, setAll] = useState<Booking[]>([]);
  useEffect(() => watchAdminBookings(setAll, () => {}), []);
  const openQuotes = useMemo(
    () => all.filter((b) => b.status === "quoted" || b.status === "identified").sort((a, b) => b.created.localeCompare(a.created)),
    [all]
  );

  const [d, setD] = useState<Draft>(EMPTY);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const preview = useMemo(
    () => quote({ fromName: d.fromName, toName: d.toName, bags: d.bags, oversize: d.oversize, mode: d.mode, date: d.date }),
    [d.fromName, d.toName, d.bags, d.oversize, d.mode, d.date]
  );
  const ror = "error" in preview;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<Booking | null>(null);

  async function save() {
    setBusy(true); setErr("");
    const svc = SERVICES.find((s) => s.uc === d.uc);
    const r = await fetch("/api/admin/quotes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title, name: d.name, mobile: d.mobile, email: d.email || undefined, res: d.res,
        fromName: d.fromName, toName: d.toName, pickAddr: d.pickAddr, dropAddr: d.dropAddr,
        uc: d.uc, ucName: svc?.title, mode: d.mode, date: d.date, flight: d.flight,
        bags: d.bags, oversize: d.oversize, note: d.note, validHours: d.validHours,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok || j.error) { setErr(j.error ?? "Could not save the quote"); return; }
    setSaved(j.booking as Booking);
    setD(EMPTY);
  }

  const link = saved ? `${typeof window !== "undefined" ? window.location.origin : ""}/q/${saved.id}` : "";
  const waText = saved
    ? `Hi ${saved.traveller.name.split(" ")[0]}, here's your Bagdrop quote for ${saved.from} → ${saved.to}: ${inr(saved.quote.total)}, locked for ${d.validHours}h.\nPay securely here: ${link}`
    : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid gap-5">
        <Card>
          <h3 className="mb-3 font-display text-sm font-bold">Make a quote <span className="font-normal text-faint">for phone, WhatsApp, walk-in or partner inquiries</span></h3>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Title">
              <Select value={d.title} onChange={(e) => set("title", e.target.value)}>
                {["Mr.", "Ms.", "Mrs.", "Dr.", "M/s"].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Customer name"><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" /></Field>
            <Field label="Mobile"><Input value={d.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 …" /></Field>
            <Field label="Email (optional)"><Input value={d.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
            <Field label="Traveller is">
              <Select value={d.res} onChange={(e) => set("res", e.target.value as Draft["res"])}>
                <option value="in">Indian resident · Aadhaar</option>
                <option value="intl">International · passport</option>
              </Select>
            </Field>
            <Field label="Service">
              <Select value={d.uc} onChange={(e) => {
                const svc = SERVICES.find((s) => s.uc === e.target.value);
                set("uc", e.target.value as UseCase); if (svc) set("mode", svc.mode);
              }}>
                {SERVICES.map((s) => <option key={s.uc} value={s.uc}>{s.title}</option>)}
              </Select>
            </Field>
            <Field label="Pickup city">
              <Select value={d.fromName} onChange={(e) => set("fromName", e.target.value)}>
                {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Delivery city">
              <Select value={d.toName} onChange={(e) => set("toName", e.target.value)}>
                {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Pickup address"><Input value={d.pickAddr} onChange={(e) => set("pickAddr", e.target.value)} /></Field>
            <Field label="Delivery address"><Input value={d.dropAddr} onChange={(e) => set("dropAddr", e.target.value)} /></Field>
            <Field label="Travel date"><Input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Flight / reference (optional)"><Input value={d.flight} onChange={(e) => set("flight", e.target.value)} placeholder="6E 5219" /></Field>
            <Field label="Bags"><Input type="number" min={0} value={d.bags} onChange={(e) => set("bags", Number(e.target.value))} /></Field>
            <Field label="Oversize"><Input type="number" min={0} value={d.oversize} onChange={(e) => set("oversize", Number(e.target.value))} /></Field>
            <Field label="Price lock">
              <Select value={d.validHours} onChange={(e) => set("validHours", Number(e.target.value) as Draft["validHours"])}>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={168}>7 days</option>
              </Select>
            </Field>
            <Field label="Note (optional)"><Input value={d.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>

          <div className="mb-4 rounded-xl bg-paper p-3 text-sm">
            {ror ? (
              <span className="text-muted">Rate on request — this route isn&apos;t on the chart; the quote still saves, marked rate-on-request.</span>
            ) : (
              <span><b>{inr(preview.total)}</b> <span className="text-muted">· {preview.rule} · GST included</span></span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || !d.name || !d.mobile} onClick={() => void save()}>
              {busy ? "Saving…" : "Save quote and get the payment link"}
            </Button>
            {err && <span className="text-sm text-red-700">{err}</span>}
          </div>
        </Card>

        {saved && (
          <Card>
            <h3 className="mb-2 font-display text-sm font-bold">Share with the customer</h3>
            <p className="mb-2 rounded-xl bg-green-50 p-3 text-sm text-green-900">Quote {saved.quote.qid ?? saved.id} saved · {ror ? "rate on request" : inr(saved.quote.total)}</p>
            <div className="mb-2 break-all rounded-lg bg-paper p-2 font-mono text-xs">{link}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link)}>Copy payment link</Button>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(waText)}>Copy WhatsApp message</Button>
              <Button size="sm" variant="outline" onClick={() => window.open(link, "_blank")}>Open as the customer</Button>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Open quotes <Badge tone="ok">live</Badge></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Quote</th><th className="pr-2">Customer</th><th className="pr-2">Route</th><th className="pr-2 text-right">Total</th><th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {openQuotes.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted">No open quotes.</td></tr>
              )}
              {openQuotes.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-mono text-xs">{b.quote.qid ?? b.id}</td>
                  <td className="pr-2">{b.traveller.name}<br /><span className="text-xs text-faint">{b.traveller.mobile}</span></td>
                  <td className="pr-2 text-xs">{b.from} → {b.to}</td>
                  <td className="pr-2 text-right">{inr(b.quote.total)}</td>
                  <td className="text-xs text-faint">{b.quote.validUntil ? new Date(b.quote.validUntil).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
