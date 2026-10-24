"use client";
/** Admin OS · Quotes & payments — make a quote for an inquiry that reached
 *  the team by phone/WhatsApp/walk-in/partner (not the self-serve website
 *  wizard), get a shareable payment link, and track every open quote until
 *  it's paid. Same pricing engine and signed-quote model as the website —
 *  see src/app/api/admin/quotes/route.ts. */
import { useEffect, useMemo, useRef, useState } from "react";
import { CITIES, inr, quote } from "@/lib/pricing";
import { computeTravelPlan, isSlotFeasible, SLOTS } from "@/lib/travelPlan";
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
  uc: UseCase; mode: Mode; fromName: string; toName: string; fromOther: string; toOther: string;
  pickAddr: string; dropAddr: string; date: string; pickupDate: string; deliveryDate: string; flight: string; flightTime: string; slot: string;
  bags: number; oversize: number; note: string;
}

const EMPTY: Draft = {
  title: "Mr.", name: "", mobile: "", email: "", res: "in",
  uc: "d2a", mode: "air", fromName: "Ahmedabad", toName: "Mumbai", fromOther: "", toOther: "",
  pickAddr: "", dropAddr: "", date: "", pickupDate: "", deliveryDate: "", flight: "", flightTime: "", slot: "",
  bags: 2, oversize: 0, note: "",
};

export default function QuotesAndPayments() {
  const [all, setAll] = useState<Booking[]>([]);
  useEffect(() => watchAdminBookings(setAll, () => {}), []);
  const openQuotes = useMemo(
    () => all.filter((b) => b.status === "quoted" || b.status === "identified").sort((a, b) => b.created.localeCompare(a.created)),
    [all]
  );

  const [today, setToday] = useState("");
  useEffect(() => { setToday(new Date(Date.now()).toISOString().slice(0, 10)); }, []);

  const [d, setD] = useState<Draft>(EMPTY);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const fromName = d.fromName === "other" ? d.fromOther || "Other city" : d.fromName;
  const toName = d.toName === "other" ? d.toOther || "Other city" : d.toName;
  const isOther = d.fromName === "other" || d.toName === "other";
  const preview = useMemo(
    () => (isOther ? { error: "RATE_ON_REQUEST" as const } : quote({ fromName, toName, bags: d.bags, oversize: d.oversize, mode: d.mode, date: d.date })),
    [isOther, fromName, toName, d.bags, d.oversize, d.mode, d.date]
  );
  const ror = "error" in preview;

  /** Flight/train/sailing-aware pickup planning — same logic as the website
   *  wizard (src/lib/travelPlan.ts), so a team-created quote gets the same
   *  cutoff-correct pickup slot as a self-serve booking. */
  const plan = useMemo(
    () => computeTravelPlan(d.mode, d.uc === "a2d", d.date, d.flightTime),
    [d.mode, d.uc, d.date, d.flightTime]
  );
  const autoRef = useRef({ pickupDate: "", slot: "" });
  useEffect(() => {
    if (plan.suggestedPickupDate && (!d.pickupDate || d.pickupDate === autoRef.current.pickupDate)) {
      autoRef.current.pickupDate = plan.suggestedPickupDate;
      if (d.pickupDate !== plan.suggestedPickupDate) set("pickupDate", plan.suggestedPickupDate);
    }
    if (plan.suggestedSlot && (!d.slot || d.slot === autoRef.current.slot)) {
      autoRef.current.slot = plan.suggestedSlot;
      if (d.slot !== plan.suggestedSlot) set("slot", plan.suggestedSlot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.suggestedPickupDate, plan.suggestedSlot]);

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
        fromName, toName, pickAddr: d.pickAddr, dropAddr: d.dropAddr,
        uc: d.uc, ucName: svc?.title, mode: d.mode, date: d.date, flight: d.flight,
        pickupDate: d.pickupDate || d.date, deliveryDate: d.deliveryDate || undefined, flightTime: d.flightTime || undefined, slot: d.slot,
        bags: d.bags, oversize: d.oversize, note: d.note,
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
    ? `Hi ${saved.traveller.name.split(" ")[0]}, here's your Bagdrop quote for ${saved.from} → ${saved.to}: ${inr(saved.quote.total)}, locked for 24h.\nPay securely here: ${link}`
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
                <option value="other">Others · tell us the city</option>
              </Select>
            </Field>
            <Field label="Delivery city">
              <Select value={d.toName} onChange={(e) => set("toName", e.target.value)}>
                {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
                <option value="other">Others · tell us the city</option>
              </Select>
            </Field>
            {d.fromName === "other" && (
              <Field label="Your pickup city"><Input value={d.fromOther} onChange={(e) => set("fromOther", e.target.value)} placeholder="Type the city" /></Field>
            )}
            {d.toName === "other" && (
              <Field label="Your delivery city"><Input value={d.toOther} onChange={(e) => set("toOther", e.target.value)} placeholder="Type the city" /></Field>
            )}
            <Field label="Pickup address"><Input value={d.pickAddr} onChange={(e) => set("pickAddr", e.target.value)} /></Field>
            <Field label="Delivery address"><Input value={d.dropAddr} onChange={(e) => set("dropAddr", e.target.value)} /></Field>
            <Field label="Pickup Date"><Input type="date" value={d.date} min={today} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Delivery Date (optional)"><Input type="date" value={d.deliveryDate} min={d.date || today} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
            <Field label="Flight / reference (optional)"><Input value={d.flight} onChange={(e) => set("flight", e.target.value)} placeholder="6E 5219" /></Field>
            {plan.usesFlightTime && (
              <Field label={d.uc === "a2d" ? (d.mode === "air" ? "Flight arrival time" : "Arrival time") : d.mode === "air" ? "Flight departure time" : d.mode === "rail" ? "Train departure time" : "Sailing time"}>
                <Input type="time" value={d.flightTime} onChange={(e) => set("flightTime", e.target.value)} />
              </Field>
            )}
            <Field label={`Preferred pickup time${plan.usesFlightTime && d.uc !== "a2d" && d.pickupDate && d.pickupDate !== d.date ? ` · on ${d.pickupDate} (evening before)` : ""}`}>
              <Select value={d.slot} onChange={(e) => set("slot", e.target.value)}>
                <option value="">— Select time —</option>
                {SLOTS.filter((s) => isSlotFeasible(s.label, plan, d.pickupDate || d.date)).map((s) => (
                  <option key={s.label} value={s.label}>{s.label}{s.label === plan.suggestedSlot ? " · suggested" : ""}</option>
                ))}
              </Select>
            </Field>
            {plan.usesFlightTime && <p className="mb-2 text-xs text-muted sm:col-span-2">{plan.cutoffNote}</p>}
            <Field label="Bags"><Input type="number" min={0} value={d.bags} onChange={(e) => set("bags", Number(e.target.value))} /></Field>
            <Field label="Oversize"><Input type="number" min={0} value={d.oversize} onChange={(e) => set("oversize", Number(e.target.value))} /></Field>
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
