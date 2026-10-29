"use client";
/** The customer booking wizard — the migration template for every other page.
 *  Pattern: typed draft state → pure pricing preview → SERVER-SIGNED quote
 *  (/api/quote) → booking saved in the shared Admin OS shape.
 *
 *  Flow (locked 2026-10-28): the booking is confirmed with a mobile/email OTP
 *  at booking time (server-issued, /api/otp), payment creates the booking
 *  IMMEDIATELY, and Aadhaar UIDAI verification follows payment — it can be
 *  done right here or later via /verify/<id>, but pickup is blocked
 *  server-side until it is done. A paid client who closes the tab still has
 *  their booking, their money accounted for, and a verification link coming
 *  on WhatsApp + email. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CITIES, inr, quote } from "@/lib/pricing";
import { computeTravelPlan, isSlotFeasible, SLOTS } from "@/lib/travelPlan";
import { backend, createBooking, newBookingId, nowIso, updateBooking, watchBooking } from "@/lib/db";
import type { Booking, Mode, SignedQuote, UseCase } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select, Tile } from "@/components/ui";

const SERVICES: { uc: UseCase; mode: Mode; title: string; sub: string }[] = [
  { uc: "d2a", mode: "air", title: "Home → Airport", sub: "Bags reach the airport before you do" },
  { uc: "a2d", mode: "air", title: "Airport → Home", sub: "Land and leave, we bring them home" },
  { uc: "h2a", mode: "air", title: "Hotel → Airport", sub: "Check out light" },
  { uc: "h2h", mode: "road", title: "Hotel → Hotel", sub: "Next city, same bags" },
  { uc: "d2d", mode: "road", title: "Door → Door", sub: "City to city, by road" },
  { uc: "rail", mode: "rail", title: "Railway station", sub: "Vande Bharat, Rajdhani" },
  { uc: "cruise", mode: "sea", title: "Cruise terminal", sub: "Mumbai, Goa, Kochi sailings" },
];
const STEPS = ["Service", "Route", "When", "Bags", "You", "Confirm", "Price", "Pay"];
const AAD_DEMO = "112233";

interface Draft {
  uc: UseCase; mode: Mode;
  from: string; to: string; fromOther: string; toOther: string;
  pickAddr: string; dropAddr: string;
  date: string; pickupDate: string; deliveryDate: string; slot: string; flight: string; flightTime: string;
  bags: number; oversize: number;
  name: string; mobile: string; email: string; note: string;
}

interface OtpState {
  channel: "mobile" | "email";
  sent: boolean; exp: number; token: string; entered: string; sentTo?: string;
  demo?: string; verifiedAt: string | null; err: string | null; busy: boolean;
}
const OTP0: OtpState = { channel: "mobile", sent: false, exp: 0, token: "", entered: "", verifiedAt: null, err: null, busy: false };

export default function Wizard() {
  const [step, setStep] = useState(0);
  const [today, setToday] = useState("");
  const [d, setD] = useState<Draft>({
    uc: "d2a", mode: "air", from: "Ahmedabad", to: "Mumbai", fromOther: "", toOther: "",
    pickAddr: "", dropAddr: "", date: "", pickupDate: "", deliveryDate: "", slot: "", flight: "", flightTime: "",
    bags: 2, oversize: 0, name: "", mobile: "", email: "", note: "",
  });
  /* dates come from the clock, which prerender forbids — set them on mount */
  useEffect(() => {
    const now = Date.now();
    setToday(new Date(now).toISOString().slice(0, 10));
    setD((p) => (p.date ? p : { ...p, date: new Date(now + 4 * 86400000).toISOString().slice(0, 10) }));
  }, []);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  /** Same-day pickup isn't operationally possible — a captain needs to be
   *  assigned and routed. Earliest bookable date is 24h after "now", i.e.
   *  tomorrow relative to `today`. */
  const minDate = useMemo(() => {
    if (!today) return "";
    const d2 = new Date(`${today}T00:00:00`);
    d2.setDate(d2.getDate() + 1);
    return d2.toISOString().slice(0, 10);
  }, [today]);
  const minDateLabel = minDate ? new Date(`${minDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

  /** Flight/train/sailing-aware pickup planning — auto-fills the suggested
   *  date/slot, same "keep tracking until the customer types their own
   *  value" pattern as the admin team-quote form. */
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

  const fromName = d.from === "other" ? d.fromOther || "Other city" : d.from;
  const toName = d.to === "other" ? d.toOther || "Other city" : d.to;
  const isOther = d.from === "other" || d.to === "other";
  const mobileOk = /^\+?[\d\s-]{10,15}$/.test(d.mobile.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim());

  /** instant client preview (display only — the signed figure rules) */
  const preview = useMemo(
    () => (isOther ? { error: "RATE_ON_REQUEST" as const } : quote({ fromName, toName, bags: d.bags, oversize: d.oversize, mode: d.mode, date: d.date })),
    [fromName, toName, d.bags, d.oversize, d.mode, d.date, isOther]
  );
  const ror = "error" in preview;

  /* ---------- booking-time OTP (mobile or email, server-issued) ---------- */
  const [otp, setOtp] = useState<OtpState>(OTP0);
  const otpDest = otp.channel === "email" ? d.email.trim() : d.mobile.trim();

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

  async function verifyOtp() {
    setOtp((p) => ({ ...p, busy: true, err: null }));
    try {
      const to = otp.channel === "email" ? d.email.trim().toLowerCase() : d.mobile.trim();
      // the server normalised the destination when issuing — send what it echoed
      const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", to: otp.sentTo ?? to, code: otp.entered, exp: otp.exp, token: otp.token }) });
      const j = await r.json();
      if (j.error) setOtp((p) => ({ ...p, busy: false, err: "That code didn't match or has expired — check and try again, or resend." }));
      else setOtp((p) => ({ ...p, busy: false, verifiedAt: j.at }));
    } catch { setOtp((p) => ({ ...p, busy: false, err: "Could not reach the server — try again." })); }
  }

  /* if the contact details change after verification, the proof is void */
  useEffect(() => { setOtp(OTP0); }, [d.mobile, d.email]);

  /** server-signed quote */
  const [signed, setSigned] = useState<SignedQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState(false);
  const fetchSigned = useCallback(async () => {
    if (ror) return;
    setQuoteErr(false);
    try {
      const r = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromName, toName, bags: d.bags, oversize: d.oversize, mode: d.mode, date: d.date }),
      });
      const j = await r.json();
      if (!j.error) setSigned(j as SignedQuote); else setQuoteErr(true);
    } catch { setQuoteErr(true); }
  }, [ror, fromName, toName, d.bags, d.oversize, d.mode, d.date]);
  useEffect(() => { if (step === 6) void fetchSigned(); }, [step, fetchSigned]);

  /* ---------- payment → booking created at once; Aadhaar follows ---------- */
  const [booking, setBooking] = useState<Booking | null>(null);
  const [live, setLive] = useState<Booking | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  useEffect(() => {
    if (!booking) return;
    return watchBooking(booking.id, setLive);
  }, [booking]);

  async function payAndBook() {
    if (payBusy) return;
    setPayBusy(true); setPayErr(null);
    try {
      const id = newBookingId();
      const fromCity = CITIES.find((c) => c.name === fromName);
      const toCity = CITIES.find((c) => c.name === toName);
      const total = ror ? 0 : signed?.total ?? 0;
      const now = nowIso();
      const doc: Booking = {
        id, created: now, status: "submitted",
        uc: d.uc, ucName: SERVICES.find((s) => s.uc === d.uc)?.title ?? d.uc, mode: d.mode,
        from: fromName, to: toName, pickAddr: d.pickAddr.trim(), dropAddr: d.dropAddr.trim(),
        zo: fromCity?.zone ?? "", zd: toCity?.zone ?? "",
        date: d.date, pickupDate: d.pickupDate || d.date, deliveryDate: d.deliveryDate || null, flightTime: d.flightTime || null, ref: d.flight.trim().toUpperCase(), slot: d.slot,
        bags: d.bags, oversize: d.oversize, billed: ror ? Math.max(d.bags + d.oversize, 1) : signed?.billed ?? d.bags,
        traveller: { name: d.name.trim(), mobile: d.mobile.trim(), email: d.email.trim(), res: "in" },
        payer: null, note: d.note.trim(), source: "website · next",
        quote: ror
          ? { qid: null, total: 0, breakdown: { ror: true } }
          : { qid: signed!.qid, total, breakdown: signed!, validUntil: signed!.validUntil, signature: signed!.signature },
        /* Aadhaar is NOT done yet — it follows payment and gates pickup */
        identity: { ok: false, at: "", method: "UIDAI Aadhaar OTP · pending (required before pickup)", score: 0 },
        pay: ror ? null : { mode: "full", amount: total, status: "captured", gateway: "Razorpay (demo)", at: now },
        admin: {},
        events: [
          { at: now, by: "customer", text: `Booking confirmed with ${otp.channel} OTP (${otp.channel === "email" ? d.email.trim() : d.mobile.trim()})${otp.verifiedAt ? ` at ${otp.verifiedAt}` : ""}` },
          { at: now, by: "customer", text: ror ? "Booking request · RATE ON REQUEST · Aadhaar verification pending" : `Paid ${inr(total)} against signed quote ${signed!.qid} · Aadhaar verification pending (required before pickup)` },
        ],
      };
      const saved = await createBooking(doc);
      setBooking(saved);
    } catch {
      setPayErr("Something went wrong saving the booking — your card was not charged. Please try again.");
    } finally { setPayBusy(false); }
  }

  /* ---------- post-payment Aadhaar (inline, same as /verify/<id>) ---------- */
  const [aad, setAad] = useState({ code: "", busy: false, err: null as string | null });
  async function verifyAadhaar() {
    if (!booking) return;
    setAad((p) => ({ ...p, busy: true, err: null }));
    try {
      if (backend === "local") {
        if (aad.code.trim() !== AAD_DEMO) { setAad((p) => ({ ...p, busy: false, err: "That OTP didn't match — try again." })); return; }
        const next = await updateBooking(booking.id, { identity: { ok: true, at: nowIso(), method: "UIDAI Aadhaar OTP · DigiLocker (demo)", score: 0.97 } },
          "Identity verified · UIDAI Aadhaar OTP (post-payment, pre-pickup)");
        setLive(next);
        setAad({ code: "", busy: false, err: null });
        return;
      }
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: booking.id, otp: aad.code }) });
      const j = await r.json();
      if (j.error) setAad((p) => ({ ...p, busy: false, err: j.error === "WRONG_OTP" ? "That OTP didn't match — check the code UIDAI sent and try again." : j.error }));
      else { setAad({ code: "", busy: false, err: null }); setLive((p) => (p ? { ...p, identity: { ok: true, at: nowIso(), method: "UIDAI Aadhaar OTP · DigiLocker (demo)", score: 0.97 } } : p)); }
    } catch { setAad((p) => ({ ...p, busy: false, err: "Could not reach the server — try again." })); }
  }

  /* ---------- step validity ---------- */
  const canNext = [
    true,
    (!!d.pickAddr.trim() || d.uc === "a2d") && (!isOther || (d.from !== "other" || !!d.fromOther.trim()) && (d.to !== "other" || !!d.toOther.trim())),
    !!d.slot && !!d.date && d.date >= minDate,
    d.bags + d.oversize > 0,
    d.name.trim().length > 1 && mobileOk,
    !!otp.verifiedAt,
    ror || (!!signed && !quoteErr),
  ][step] ?? true;

  if (booking) {
    const st = live ?? booking;
    const verified = !!st.identity?.ok;
    const stages = ["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered"];
    const idx = stages.indexOf(st.status);
    return (
      <Card className="mx-auto max-w-2xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-green-50 text-2xl text-green-700">✓</div>
          <h2 className="font-display text-2xl font-extrabold">Booking confirmed</h2>
          <p className="mt-1 text-sm text-muted">Reference <b className="font-mono">{booking.id}</b> — live status below updates as our team progresses your booking.</p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {["Booked", "Accepted", "Captain", "Picked up", "In transit", "Delivered"].map((s, i) => (
            <div key={s} className={`rounded-lg p-2 text-center text-[11px] ${i <= idx ? "bg-green-50 text-green-800" : "bg-paper text-muted"}`}>{s}</div>
          ))}
        </div>

        {/* THE Aadhaar gate — after payment, before pickup */}
        {!verified ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">One step left before pickup: Aadhaar verification</p>
            <p className="mt-1 text-xs text-amber-900/80">UIDAI sends an OTP to your Aadhaar-linked mobile. Your bags are picked up only after this is done — do it now, or later at <span className="font-mono">bagdrop.co/verify/{booking.id}</span> (we&apos;ve sent you the link too). <span className="font-mono">(demo: {AAD_DEMO})</span></p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Input className="w-40 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={aad.code} onChange={(e) => setAad((p) => ({ ...p, code: e.target.value }))} placeholder="UIDAI OTP" />
              <Button disabled={aad.busy || aad.code.trim().length !== 6} onClick={() => void verifyAadhaar()}>{aad.busy ? "Checking…" : "Verify now"}</Button>
            </div>
            {aad.err && <p className="mt-2 text-sm text-red-700">{aad.err}</p>}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>Identity verified</b> · UIDAI Aadhaar OTP · pickup is released.</p>
        )}

        <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          {st.status === "accepted" && `Confirmed · captain ${String((st.admin as { captain?: string }).captain ?? "to be assigned")} · pickup ${st.slot} on ${st.date}.`}
          {st.status === "submitted" && (st.quote.breakdown.ror ? "Request received — our team will call you with the rate for this route." : "With Bagdrop operations — you will hear from us within the hour.")}
          {["assigned", "picked_up", "in_transit", "delivered"].includes(st.status) && `Status: ${st.status.replace("_", " ")}.`}
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        {/* stepper */}
        <ol className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} title={s} />
          ))}
        </ol>

        {step === 0 && (
          <>
            <H>Choose your service</H>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {SERVICES.map((s) => (
                <Tile key={s.uc} selected={d.uc === s.uc} onClick={() => { set("uc", s.uc); set("mode", s.mode); }} title={s.title} sub={s.sub} />
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <H>Pickup &amp; delivery</H>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Pickup city">
                <Select value={d.from} onChange={(e) => set("from", e.target.value)}>
                  {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
                  <option value="other">Others · tell us the city</option>
                </Select>
              </Field>
              <Field label="Delivery city">
                <Select value={d.to} onChange={(e) => set("to", e.target.value)}>
                  {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
                  <option value="other">Others · tell us the city</option>
                </Select>
              </Field>
              {d.from === "other" && (
                <Field label="Your pickup city"><Input value={d.fromOther} onChange={(e) => set("fromOther", e.target.value)} placeholder="Type the city" /></Field>
              )}
              {d.to === "other" && (
                <Field label="Your delivery city"><Input value={d.toOther} onChange={(e) => set("toOther", e.target.value)} placeholder="Type the city" /></Field>
              )}
              <Field label="Pickup address"><Input value={d.pickAddr} onChange={(e) => set("pickAddr", e.target.value)} placeholder="Flat, building, area or pincode" /></Field>
              <Field label="Delivery address"><Input value={d.dropAddr} onChange={(e) => set("dropAddr", e.target.value)} placeholder="Hotel, home, terminal" /></Field>
            </div>
            {isOther && (
              <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                <b>Route not on our rate chart yet</b> — book anyway. No payment is taken now; our team gets in touch with the rate and the pickup plan.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <H>When are you travelling?</H>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label={d.mode === "air" ? "Flight number" : "Reference (optional)"}>
                <Input value={d.flight} onChange={(e) => set("flight", e.target.value)} placeholder="6E 5219" />
              </Field>
              <Field label="Pickup Date">
                <Input
                  type="date" value={d.date} min={minDate}
                  title="Pickup needs at least 24 hours' notice from booking time"
                  onChange={(e) => set("date", e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">Needs 24 hours&apos; notice — earliest pickup is {minDateLabel || "tomorrow"}.</p>
              </Field>
              <Field label="Delivery Date (optional)">
                <Input type="date" value={d.deliveryDate} min={d.date || minDate} onChange={(e) => set("deliveryDate", e.target.value)} />
              </Field>
            </div>
            {plan.usesFlightTime && (
              <div className="mb-3">
                <Field label={d.uc === "a2d" ? (d.mode === "air" ? "Flight arrival time" : "Arrival time") : d.mode === "air" ? "Flight departure time" : d.mode === "rail" ? "Train departure time" : "Sailing time"}>
                  <Input type="time" value={d.flightTime} onChange={(e) => set("flightTime", e.target.value)} />
                </Field>
                <p className="mt-1.5 text-xs text-muted">{plan.cutoffNote}</p>
              </div>
            )}
            <Field label={`Preferred pickup time${plan.usesFlightTime && d.uc !== "a2d" && d.pickupDate && d.pickupDate !== d.date ? ` · on ${d.pickupDate} (evening before)` : ""}`}>
              <Select value={d.slot} onChange={(e) => set("slot", e.target.value)}>
                <option value="">— Select time —</option>
                {SLOTS.filter((s) => isSlotFeasible(s.label, plan, d.pickupDate || d.date)).map((s) => (
                  <option key={s.label} value={s.label}>{s.label}{s.label === plan.suggestedSlot ? " · suggested" : ""}</option>
                ))}
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
                  <Button variant="outline" size="sm" onClick={() => set(k, d[k] + 1)}>+</Button>
                </div>
              </div>
            ))}
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              <b>Please do not pack</b> · cash, jewellery, passports, medicines you need in transit, loose lithium batteries. Our captain checks and seals each bag with you at pickup.
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <H>Traveller details</H>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Full name (as on the ID you verify with)"><Input value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Mobile"><Input value={d.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 98XXX XXXXX" inputMode="tel" /></Field>
              <Field label="Email (optional)"><Input value={d.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
              <Field label="Anything we should know"><Input value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="Gate code, fragile item inside" /></Field>
            </div>
            {d.mobile.trim().length > 0 && !mobileOk && <p className="text-sm text-red-700">That mobile number doesn&apos;t look right — 10 digits, +91 optional.</p>}
          </>
        )}

        {step === 5 && (
          <>
            <H>Verify your contact</H>
            <p className="mb-4 text-sm text-muted">A one-time code confirms your booking contact. Choose where we send it — the code is valid for 10 minutes.</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Tile selected={otp.channel === "mobile"} onClick={() => !otp.verifiedAt && sendOtp("mobile")} title="WhatsApp / SMS" sub={d.mobile.trim() || "your mobile"} />
              <Tile selected={otp.channel === "email"} onClick={() => !otp.verifiedAt && (emailOk ? sendOtp("email") : setOtp((p) => ({ ...p, err: "Add a valid email on the previous step to use email OTP." })))} title="Email" sub={d.email.trim() || "add email on previous step"} />
            </div>
            {otp.sent && !otp.verifiedAt && (
              <div className="flex flex-wrap items-center gap-2.5">
                <Input className="w-36 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp.entered} onChange={(e) => setOtp((p) => ({ ...p, entered: e.target.value, err: null }))} placeholder="••••••" />
                <Button disabled={otp.busy || otp.entered.trim().length !== 6} onClick={() => void verifyOtp()}>{otp.busy ? "Checking…" : "Verify"}</Button>
                <Button variant="ghost" size="sm" disabled={otp.busy} onClick={() => void sendOtp(otp.channel)}>Resend</Button>
              </div>
            )}
            {otp.sent && !otp.verifiedAt && (
              <p className="mt-2 text-xs text-muted">Code sent to {otpDest}.{otp.demo ? <span className="font-mono"> (demo: {otp.demo})</span> : null}</p>
            )}
            {otp.verifiedAt && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>Confirmed</b> · {otp.channel} verified · your booking is made against this contact.</p>}
            {otp.err && <p className="mt-2 text-sm text-red-700">{otp.err}</p>}
          </>
        )}

        {step === 6 && (
          <>
            <H>{ror ? "Rate on request" : "Your locked price"}</H>
            {ror ? (
              <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                This route is not on our rate chart yet. Continue: no payment is taken, and the team confirms the rate before anything moves.
              </p>
            ) : quoteErr ? (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">Could not fetch your locked price — <Button size="sm" variant="outline" onClick={() => void fetchSigned()}>try again</Button></p>
            ) : signed ? (
              <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
                <b>Locked</b> · {signed.qid} · {inr(signed.total)} until {new Date(signed.validUntil).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · signature {signed.signature.slice(0, 10)}… <Badge tone="ok">server-signed</Badge>
              </p>
            ) : (
              <p className="text-sm text-muted">Locking your price…</p>
            )}
          </>
        )}

        {step === 7 && (
          <>
            <H>{ror ? "Submit your request" : "Payment"}</H>
            <p className="mb-4 text-sm text-muted">
              {ror
                ? "No payment now — the team calls with the rate for your route. Aadhaar verification follows before pickup."
                : "UPI, card or net banking. The server verifies the quote signature before capture — the browser can never set its own price. Your booking is created the moment payment lands; Aadhaar UIDAI verification follows and must be done before pickup."}
            </p>
            <Button size="lg" className="w-full" disabled={payBusy || (!ror && !signed)} onClick={() => void payAndBook()}>
              {payBusy ? "Processing…" : ror ? "Submit booking request — no payment now" : `Pay ${signed ? inr(signed.total) : ""} securely (demo)`}
            </Button>
            {payErr && <p className="mt-2 text-sm text-red-700">{payErr}</p>}
          </>
        )}

        <div className="mt-6 flex justify-between gap-3">
          {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step < 7 && <Button className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>}
        </div>
      </Card>

      {/* summary */}
      <aside>
        <Card className="lg:sticky lg:top-6">
          <h3 className="mb-2 font-display text-sm font-bold">Your booking</h3>
          {([
            ["Service", SERVICES.find((s) => s.uc === d.uc)?.title],
            ["Route", `${fromName} → ${toName}`],
            ["Pickup date", `${d.date}${d.flight ? ` · ${d.flight.toUpperCase()}` : ""}`],
            ["Pickup time", d.slot || "—"],
            ["Delivery date", d.deliveryDate || "—"],
            ["Pieces", `${d.bags} bags${d.oversize ? ` + ${d.oversize} oversize` : ""}`],
            ["Traveller", d.name || "—"],
            ["Contact", otp.verifiedAt ? `verified · ${otp.channel}` : "verify at step 6"],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
              <span className="text-muted">{k}</span><span className="text-right">{v}</span>
            </div>
          ))}
          {/* Price is deliberately NOT shown here — it is revealed at the
            * "Your locked price" step, server-signed. The side card carries
            * trust content instead (see /sidecard-options.html). */}
          {step >= 6 && !ror && !("error" in preview) ? (
            <div className="relative mt-3 overflow-hidden rounded-xl bg-ink p-4 text-cream">
              <p className="font-mono text-[11px] opacity-75">GST 5% included · server-signed</p>
              <p className="font-display text-3xl font-extrabold">{inr(preview.total)}</p>
              <p className="text-xs opacity-75">{inr(preview.perBag)} per piece · {preview.billed} billed</p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-ink p-4 text-cream">
              <p className="font-mono text-[11px] opacity-75">{ror ? "Rate on request" : "Transparent pricing"}</p>
              <p className="mt-1 text-[13px] leading-relaxed">
                {ror
                  ? "Our team calls with the rate for this route — no payment is taken now."
                  : "Your exact price is revealed before payment — GST 5% included, no hidden charges, locked for 24 hours."}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                {["Sealed at pickup", "Scan-tracked", "Insured"].map((t) => (
                  <span key={t} className="rounded-lg bg-white/10 px-1 py-1.5">{t}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 font-display text-2xl font-extrabold tracking-tight">{children}<span className="mb-4 block" /></h2>;
}
