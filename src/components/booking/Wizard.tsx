"use client";
/** The homepage booking flow (approved 30 Oct 2026).
 *  1. Service → route → when → bags → traveller. Cities, airports and the
 *     rate-chart sectors come LIVE from the pricing engine (/api/catalog).
 *  2. The customer verifies a mobile/email OTP; only then does the server
 *     (/api/booking) save the request and release the price — for a sector
 *     on the rate chart. A new sector becomes an inquiry, no price shown.
 *     The inquiry desk (info@ + aditya@) is alerted.
 *  3. The team approves / revises / holds / asks / rejects in BAGDROP OS.
 *  4. The client pays, uploads proof and manages bags in their dashboard
 *     (/account). Nothing on this page writes to the database directly. */
import { useEffect, useMemo, useState } from "react";
import { useNow } from "@/lib/useNow";
import { withBase } from "@/lib/basePath";
import { useOnChange, usePlanAutofill } from "@/lib/stateSync";
import { CITIES, inr } from "@/lib/pricing";
import { SERVICES } from "@/lib/services";
import { computeTravelPlan, isSlotFeasible, SLOTS } from "@/lib/travelPlan";
import type { InstantRule, UseCase } from "@/lib/types";
import { DEFAULT_INSTANT, instantCheck } from "@/lib/instant";
import OnlinePay from "@/components/OnlinePay";
import { Button, Card, Field, Input, Select, Tile } from "@/components/ui";

const STEPS = ["Service", "Route", "When", "Bags", "You", "Verify"];

interface Catalog {
  cities: { name: string; ap: string | null }[];
  airports: Record<string, { name: string; terminals?: string[] }>;
  sectors: { from: string; to: string; both: boolean; instant?: InstantRule | null }[];
}
const FALLBACK: Catalog = { cities: CITIES.map((c) => ({ name: c.name, ap: c.ap ?? null })), airports: {}, sectors: [] };

interface Draft {
  uc: UseCase;
  from: string; to: string; fromOther: string; toOther: string;
  pickAddr: string; dropAddr: string; terminal: string;
  date: string; pickupDate: string; deliveryDate: string; slot: string; flight: string; flightTime: string;
  bags: number; oversize: number;
  name: string; mobile: string; email: string; note: string;
}

interface OtpState {
  channel: "mobile" | "email"; sent: boolean; exp: number; token: string; entered: string; sentTo?: string;
  demo?: string; err: string | null; busy: boolean;
}
const OTP0: OtpState = { channel: "mobile", sent: false, exp: 0, token: "", entered: "", err: null, busy: false };

interface Result {
  id: string; priced: boolean;
  instant: { holdUntil: string; holdMinutes: number } | null; instantReason: string | null; paid?: boolean;
  price: null | { total: number; base: number; oversize: number; gst: number; billed: number; rule: string; validUntil: string | null };
}

const norm = (s: string) => s.trim().toLowerCase();

export default function Wizard() {
  const [step, setStep] = useState(0);
  const now = useNow();
  const today = now ? new Date(now).toISOString().slice(0, 10) : "";
  const [cat, setCat] = useState<Catalog>(FALLBACK);
  const [d, setD] = useState<Draft>({
    uc: "d2a", from: "Ahmedabad", to: "Mumbai", fromOther: "", toOther: "",
    pickAddr: "", dropAddr: "", terminal: "",
    date: "", pickupDate: "", deliveryDate: "", slot: "", flight: "", flightTime: "",
    bags: 2, oversize: 0, name: "", mobile: "", email: "", note: "",
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  /* default travel date: 4 days out, once the browser clock is known */
  useOnChange(now ? "dated" : "", () => {
    if (now) setD((p) => (p.date ? p : { ...p, date: new Date(now + 4 * 86400000).toISOString().slice(0, 10) }));
  });
  useEffect(() => {
    void fetch("/api/catalog").then((r) => r.json()).then((j: Catalog) => { if (j.cities?.length) setCat(j); }).catch(() => {});
  }, []);

  const svc = SERVICES.find((s) => s.uc === d.uc)!;
  const minDate = useMemo(() => {
    if (!today) return "";
    const d2 = new Date(`${today}T00:00:00`);
    d2.setDate(d2.getDate() + 1);
    return d2.toISOString().slice(0, 10);
  }, [today]);
  const minDateLabel = minDate ? new Date(`${minDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

  /* flight / train / sailing-aware pickup planning (team feature, kept) */
  const plan = useMemo(() => computeTravelPlan(svc.mode, d.uc === "a2d", d.date, d.flightTime), [svc.mode, d.uc, d.date, d.flightTime]);
  usePlanAutofill(plan, d, setD);

  const fromName = d.from === "other" ? d.fromOther.trim() : d.from;
  const toName = d.to === "other" ? d.toOther.trim() : d.to;

  /* the airport end of an air service: pick the airport (+ terminal) */
  const airportCity = svc.airportEnd === "from" ? d.from : svc.airportEnd === "to" ? d.to : null;
  const apCode = airportCity && airportCity !== "other" ? cat.cities.find((c) => c.name === airportCity)?.ap ?? null : null;
  const airport = apCode ? cat.airports[apCode] : undefined;
  const airportLabel = airport ? `${airport.name}${d.terminal ? ` · ${d.terminal}` : ""}` : "";
  useOnChange(`${airportLabel}|${svc.airportEnd ?? ""}`, () => {
    if (!airport) return;
    if (svc.airportEnd === "to") set("dropAddr", airportLabel);
    if (svc.airportEnd === "from") set("pickAddr", airportLabel);
  });
  useOnChange(apCode ?? "", () => set("terminal", ""));

  /* is this sector on the rate chart? (informational — the server decides) */
  const onChart = useMemo(() => {
    if (!fromName || !toName || d.from === "other" || d.to === "other") return false;
    return cat.sectors.some((s) => (norm(s.from) === norm(fromName) && norm(s.to) === norm(toName)) || (s.both && norm(s.from) === norm(toName) && norm(s.to) === norm(fromName)));
  }, [cat.sectors, fromName, toName, d.from, d.to]);

  /* instant confirmation for this route + date (informational — the server
   * re-checks, including how many instant places are left that day) */
  const instantHint = useMemo(() => {
    if (!onChart || !now) return null;
    const sec = cat.sectors.find((s) => (norm(s.from) === norm(fromName) && norm(s.to) === norm(toName)) || (s.both && norm(s.from) === norm(toName) && norm(s.to) === norm(fromName)));
    if (!sec?.instant?.enabled) return null;
    const day = d.pickupDate || d.date;
    if (!day) return null;
    const ist = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
    const route = { from: sec.from, to: sec.to, dir: sec.both ? "both" as const : "one" as const, r1: 0, r2: 0, addl: 0, instant: sec.instant };
    return instantCheck(route, { date: day, bags: d.bags, oversize: d.oversize }, ist, DEFAULT_INSTANT, 0);
  }, [onChart, now, cat.sectors, fromName, toName, d.pickupDate, d.date, d.bags, d.oversize]);

  const mobileOk = /^\+?[\d\s-]{10,15}$/.test(d.mobile.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim());

  /* ---------- OTP, then the server saves the booking and releases the price ---------- */
  const [otp, setOtp] = useState<OtpState>(OTP0);
  const [result, setResult] = useState<Result | null>(null);
  useOnChange(`${d.mobile}|${d.email}`, () => setOtp(OTP0));

  async function sendOtp(channel: "mobile" | "email") {
    const to = channel === "email" ? d.email.trim() : d.mobile.trim();
    setOtp({ ...OTP0, channel, busy: true });
    try {
      const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", channel, to }) });
      const j = await r.json();
      if (j.error) setOtp((p) => ({ ...p, busy: false, err: j.detail ?? (j.error === "BAD_MOBILE" ? "That mobile number doesn't look right — go back and fix it." : j.error === "BAD_EMAIL" ? "That email doesn't look right — go back and fix it." : "Could not send the code — try again.") }));
      else setOtp((p) => ({ ...p, busy: false, sent: true, exp: j.exp, token: j.token, demo: j.demo, sentTo: j.to }));
    } catch { setOtp((p) => ({ ...p, busy: false, err: "Could not reach the server — try again." })); }
  }

  async function verifyAndSubmit() {
    setOtp((p) => ({ ...p, busy: true, err: null }));
    try {
      const r = await fetch("/api/booking", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otp: { to: otp.sentTo, code: otp.entered.trim(), exp: otp.exp, token: otp.token, channel: otp.channel },
          draft: {
            uc: d.uc, name: d.name, mobile: d.mobile, email: d.email,
            fromName, toName, pickAddr: d.pickAddr, dropAddr: d.dropAddr,
            date: d.date, pickupDate: d.pickupDate, deliveryDate: d.deliveryDate, slot: d.slot,
            flight: d.flight, flightTime: d.flightTime, bags: d.bags, oversize: d.oversize, note: d.note,
          },
        }),
      });
      const j = await r.json();
      if (j.error) {
        setOtp((p) => ({ ...p, busy: false, err: j.error === "OTP_INVALID" ? "That code didn't match or has expired — check it, or resend." : (j.detail ?? "Could not save your booking — please try again.") }));
        return;
      }
      setResult({ id: j.id, priced: j.priced, price: j.price, instant: j.instant ?? null, instantReason: j.instantReason ?? null });
    } catch { setOtp((p) => ({ ...p, busy: false, err: "Could not reach the server — try again." })); }
  }

  const canNext = [
    true,
    !!fromName && !!toName && norm(fromName) !== norm(toName) && !!d.pickAddr.trim() && !!d.dropAddr.trim(),
    !!d.slot && !!d.date && d.date >= minDate,
    d.bags + d.oversize > 0,
    d.name.trim().length > 1 && mobileOk && (!d.email.trim() || emailOk),
  ][step] ?? true;

  /* ================= after submission: price (or inquiry) on screen ================= */
  if (result) {
    return (
      <Card className="mx-auto max-w-2xl anim-in">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Reference {result.id}</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">{result.paid ? "Booking confirmed ✓" : result.instant ? "⚡ Pay now to confirm instantly" : result.priced ? "Your price" : "Request received"}</h2>
        </div>
        {result.priced && result.price ? (
          <div className="mt-4 rounded-2xl bg-ink p-5 text-center text-cream">
            <p className="font-mono text-[11px] opacity-75">Sector rate chart · GST 5% included</p>
            <p className="font-display text-4xl font-extrabold">{inr(result.price.total)}</p>
            <p className="mt-1 text-xs opacity-80">{result.price.rule} · {result.price.billed} piece(s) billed</p>
            <div className="mx-auto mt-3 grid max-w-xs gap-1 text-left text-xs">
              <div className="flex justify-between border-b border-white/15 py-1"><span className="opacity-80">Base</span><span className="font-mono">{inr(result.price.base)}</span></div>
              {result.price.oversize > 0 && <div className="flex justify-between border-b border-white/15 py-1"><span className="opacity-80">Oversize</span><span className="font-mono">{inr(result.price.oversize)}</span></div>}
              <div className="flex justify-between py-1"><span className="opacity-80">GST 5%</span><span className="font-mono">{inr(result.price.gst)}</span></div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            <b>{fromName} → {toName} is a new sector</b> — it isn&apos;t on our rate chart yet, so no price is shown. Your request is with our team, who will share the rate with you shortly.
          </p>
        )}
        {result.instant && result.price && !result.paid && (
          <div className="mt-4 grid gap-2">
            <OnlinePay bookingId={result.id} kind="full" amount={result.price.total} fallbackHint="or pay later from My bookings" onPaid={() => setResult((r) => (r ? { ...r, paid: true } : r))} />
            <p className="text-center text-xs text-muted">Held for you for {result.instant.holdMinutes} minutes. Not paid by then? No problem — our team confirms it and sends the payment details.</p>
          </div>
        )}
        {result.paid && <p className="mt-4 rounded-xl bg-green-50 p-3 text-center text-sm text-green-900"><b>Paid and confirmed.</b> Your invoice and the pre-pickup steps are on their way by WhatsApp and email.</p>}
        {!result.instant && result.priced && result.instantReason && <p className="mt-3 rounded-xl bg-paper p-3 text-xs text-muted">Instant confirmation wasn&apos;t available for this booking: {result.instantReason}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {(result.instant
            ? [["1", "Pay now", "Card, UPI or netbanking — secured by Razorpay"], ["2", "Confirmed instantly", "No waiting for approval on this route"], ["3", "Verify & go", "Quick identity check, then sealed pickup"]]
            : [["1", "Team review", "We approve your booking — usually within the hour"], ["2", "Pay", "Payment details by WhatsApp, email and in your dashboard"], ["3", "Verify & go", "Quick identity check, then sealed pickup"]]).map(([n, t, s]) => (
            <div key={n} className="rounded-xl bg-paper p-3 text-center">
              <span className="mx-auto mb-1 flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
              <b className="block text-[13px]">{t}</b><span className="text-xs text-muted">{s}</span>
            </div>
          ))}
        </div>
        <a href={withBase("/account")} className="mt-4 block"><Button size="lg" className="w-full">Open my dashboard →</Button></a>
        {!result.instant && <p className="mt-2 text-center text-xs text-muted">No payment is taken until the team approves your booking.</p>}
      </Card>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
          <span className="text-[11px] text-faint">price shown after verification</span>
        </div>
        <ol className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => <li key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-brand" : "bg-line"}`} title={s} />)}
        </ol>

        <div key={step} className="anim-in">
          {step === 0 && (
            <>
              <H>Choose your service</H>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {SERVICES.map((s) => <Tile key={s.uc} selected={d.uc === s.uc} onClick={() => setD((p) => ({ ...p, uc: s.uc, pickAddr: "", dropAddr: "", terminal: "" }))} title={s.title} sub={s.sub} />)}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <H>Pickup &amp; delivery</H>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Pickup city">
                  <Select value={d.from} onChange={(e) => setD((p) => ({ ...p, from: e.target.value, pickAddr: svc.airportEnd === "from" ? "" : p.pickAddr }))}>
                    {cat.cities.map((c) => <option key={c.name}>{c.name}</option>)}
                    <option value="other">Others · tell us the city</option>
                  </Select>
                </Field>
                <Field label="Delivery city">
                  <Select value={d.to} onChange={(e) => setD((p) => ({ ...p, to: e.target.value, dropAddr: svc.airportEnd === "to" ? "" : p.dropAddr }))}>
                    {cat.cities.map((c) => <option key={c.name}>{c.name}</option>)}
                    <option value="other">Others · tell us the city</option>
                  </Select>
                </Field>
                {d.from === "other" && <Field label="Your pickup city"><Input value={d.fromOther} onChange={(e) => set("fromOther", e.target.value)} placeholder="Type the city" /></Field>}
                {d.to === "other" && <Field label="Your delivery city"><Input value={d.toOther} onChange={(e) => set("toOther", e.target.value)} placeholder="Type the city" /></Field>}

                {svc.airportEnd === "from" && airport ? (
                  <AirportField label="Pickup airport" airport={airport} terminal={d.terminal} onTerminal={(t) => set("terminal", t)} />
                ) : (
                  <Field label="Pickup address"><Input value={d.pickAddr} onChange={(e) => set("pickAddr", e.target.value)} placeholder={svc.airportEnd === "from" ? "Airport and terminal" : "Flat, building, area or pincode"} /></Field>
                )}
                {svc.airportEnd === "to" && airport ? (
                  <AirportField label="Delivery airport" airport={airport} terminal={d.terminal} onTerminal={(t) => set("terminal", t)} />
                ) : (
                  <Field label="Delivery address"><Input value={d.dropAddr} onChange={(e) => set("dropAddr", e.target.value)} placeholder={svc.airportEnd === "to" ? "Airport and terminal" : "Hotel, home, terminal"} /></Field>
                )}
              </div>
              {fromName && toName && norm(fromName) === norm(toName) && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">Pickup and delivery cities must be different.</p>}
              {fromName && toName && norm(fromName) !== norm(toName) && (
                onChart
                  ? <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>{fromName} → {toName} is on our rate chart.</b> Your exact price appears right after you verify your contact.</p>
                  : <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><b>New sector</b> — {fromName} → {toName} isn&apos;t on our rate chart yet. Book anyway: your request goes to our team as an inquiry and they share the rate with you. No price is shown and nothing is charged now.</p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <H>Travel details</H>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label={svc.mode === "air" ? "Flight number" : "Reference (optional)"}><Input value={d.flight} onChange={(e) => set("flight", e.target.value)} placeholder="6E 5219" /></Field>
                <Field label="Pickup date">
                  <Input type="date" value={d.date} min={minDate} onChange={(e) => set("date", e.target.value)} />
                  <p className="mt-1 text-[11px] text-muted">Needs 24 hours&apos; notice — earliest pickup is {minDateLabel || "tomorrow"}.</p>
                </Field>
                <Field label="Delivery date (optional)"><Input type="date" value={d.deliveryDate} min={d.date || minDate} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
              </div>
              {plan.usesFlightTime && (
                <div className="mb-3">
                  <Field label={d.uc === "a2d" ? (svc.mode === "air" ? "Flight arrival time" : "Arrival time") : svc.mode === "air" ? "Flight departure time" : svc.mode === "rail" ? "Train departure time" : "Sailing time"}>
                    <Input type="time" value={d.flightTime} onChange={(e) => set("flightTime", e.target.value)} />
                  </Field>
                  <p className="mt-1.5 text-xs text-muted">{plan.cutoffNote}</p>
                </div>
              )}
              <Field label={`Preferred pickup time${plan.usesFlightTime && d.uc !== "a2d" && d.pickupDate && d.pickupDate !== d.date ? ` · on ${d.pickupDate} (evening before)` : ""}`}>
                <Select value={d.slot} onChange={(e) => set("slot", e.target.value)}>
                  <option value="">— Select time —</option>
                  {SLOTS.filter((s) => isSlotFeasible(s.label, plan, d.pickupDate || d.date)).map((s) => <option key={s.label} value={s.label}>{s.label}{s.label === plan.suggestedSlot ? " · suggested" : ""}</option>)}
                </Select>
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <H>Bags &amp; pieces</H>
              {(["bags", "oversize"] as const).map((k) => (
                <div key={k} className="mb-3 flex items-center justify-between rounded-xl border border-line p-3.5">
                  <div>
                    <b className="font-display">{k === "bags" ? "Bags" : "Oversize"}</b>
                    <p className="text-xs text-muted">{k === "bags" ? "Suitcase, duffel, backpack · up to 32 kg each" : "Golf, surfboard, cycle, anything over 32 kg"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => set(k, Math.max(0, d[k] - 1))}>−</Button>
                    <span className="w-7 text-center font-display text-xl font-extrabold">{d[k]}</span>
                    <Button variant="outline" size="sm" onClick={() => set(k, Math.min(k === "bags" ? 50 : 20, d[k] + 1))}>+</Button>
                  </div>
                </div>
              ))}
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>Never pack</b> liquor, cash, jewellery, documents, medicines you need in transit, lighters, power banks or loose lithium batteries. The captain checks and seals each bag with you at pickup.</p>
            </>
          )}

          {step === 4 && (
            <>
              <H>Traveller details</H>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Full name (as on your ID)"><Input value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="Mobile"><Input value={d.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 98XXX XXXXX" inputMode="tel" /></Field>
                <Field label="Email (for payment details)"><Input value={d.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
                <Field label="Anything we should know"><Input value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="Gate code, fragile item inside" /></Field>
              </div>
              {d.mobile.trim().length > 0 && !mobileOk && <p className="text-sm text-red-700">That mobile number doesn&apos;t look right — 10 digits, +91 optional.</p>}
              {d.email.trim().length > 0 && !emailOk && <p className="text-sm text-red-700">That email doesn&apos;t look right.</p>}
            </>
          )}

          {step === 5 && (
            <>
              <H>Verify to see your price</H>
              <p className="mb-4 text-sm text-muted">A one-time code confirms your contact. Once verified, your booking goes to our team and {onChart ? "your price appears on screen" : "your inquiry is logged"}. The code is valid for 10 minutes.</p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Tile selected={otp.channel === "mobile" && otp.sent} onClick={() => !otp.busy && void sendOtp("mobile")} title="WhatsApp / SMS" sub={d.mobile.trim() || "your mobile"} />
                <Tile selected={otp.channel === "email" && otp.sent} onClick={() => !otp.busy && (emailOk ? void sendOtp("email") : setOtp((p) => ({ ...p, err: "Add a valid email on the previous step to use email OTP." })))} title="Email" sub={d.email.trim() || "add email on previous step"} />
              </div>
              {otp.sent && (
                <>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Input className="w-36 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp.entered} onChange={(e) => setOtp((p) => ({ ...p, entered: e.target.value, err: null }))} placeholder="••••••" />
                    <Button disabled={otp.busy || otp.entered.trim().length !== 6} onClick={() => void verifyAndSubmit()}>{otp.busy ? "Checking…" : onChart ? "Verify & see price" : "Verify & send inquiry"}</Button>
                    <Button variant="ghost" size="sm" disabled={otp.busy} onClick={() => void sendOtp(otp.channel)}>Resend</Button>
                  </div>
                  <p className="mt-2 text-xs text-muted">Code sent to {otp.channel === "email" ? d.email.trim() : d.mobile.trim()}.{otp.demo ? <span className="font-mono"> (demo: {otp.demo})</span> : null}</p>
                </>
              )}
              {otp.err && <p className="mt-2 text-sm text-red-700">{otp.err}</p>}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-between gap-3">
          {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step < 5 && <Button className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>}
        </div>
      </Card>

      <aside>
        <Card className="lg:sticky lg:top-6">
          <h3 className="mb-2 font-display text-sm font-bold">Your booking</h3>
          {([
            ["Service", svc.title],
            ["Route", `${fromName || "—"} → ${toName || "—"}`],
            ["Pickup", `${d.date || "—"}${d.slot ? ` · ${d.slot}` : ""}`],
            ["Pieces", `${d.bags} bags${d.oversize ? ` + ${d.oversize} oversize` : ""}`],
            ["Traveller", d.name || "—"],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
              <span className="text-muted">{k}</span><span className="text-right">{v}</span>
            </div>
          ))}
          <div className="mt-3 rounded-xl bg-ink p-4 text-cream">
            <p className="font-mono text-[11px] opacity-75">{onChart ? "On the rate chart" : "New sector · inquiry"}</p>
            <p className="mt-1 text-[13px] leading-relaxed">{onChart ? "Your exact price appears after you verify your contact — GST 5% included, no hidden charges." : "Our team prices new sectors personally and gets back to you — nothing is charged now."}</p>
          </div>
          {instantHint && (
            <div className={`mt-2 rounded-xl p-3 text-[13px] ${instantHint.ok ? "bg-green-50 text-green-900" : "bg-paper text-muted"}`}>
              {instantHint.ok
                ? <><b>⚡ Instant confirmation</b> — this date confirms the moment you pay, right after you verify. No waiting for approval.</>
                : <><b>Team confirmation</b> — {instantHint.reason}</>}
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

function AirportField({ label, airport, terminal, onTerminal }: { label: string; airport: { name: string; terminals?: string[] }; terminal: string; onTerminal: (t: string) => void }) {
  return (
    <Field label={label}>
      <div className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm">{airport.name}</div>
      {airport.terminals?.length ? (
        <Select className="mt-1.5" value={terminal} onChange={(e) => onTerminal(e.target.value)}>
          <option value="">Terminal (if known)</option>
          {airport.terminals.map((t) => <option key={t}>{t}</option>)}
        </Select>
      ) : null}
    </Field>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 font-display text-2xl font-extrabold tracking-tight">{children}<span className="mb-4 block" /></h2>;
}
