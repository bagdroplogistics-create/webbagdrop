"use client";
/** REDESIGN CANDIDATE — the price-free booking wizard (preview at
 *  /new-booking; the live page keeps the old design until approved).
 *
 *  No amount is shown or discussed anywhere: the customer books the pickup,
 *  verifies their contact with a mobile/email OTP, and submits. The Bagdrop
 *  team confirms the rate personally (quote link / call), payment follows,
 *  and Aadhaar UIDAI verification still gates pickup. The booking is stored
 *  in the standard rate-on-request shape, so every existing BAGDROP OS desk,
 *  cadence and automation pass works unchanged. */
import { useEffect, useState } from "react";
import { CITIES } from "@/lib/pricing";
import { createBooking, newBookingId, nowIso, watchBooking } from "@/lib/db";
import type { Booking, Mode, UseCase } from "@/lib/types";
import { Button, Card, Field, Input, Select, Tile } from "@/components/ui";

const SERVICES: { uc: UseCase; mode: Mode; title: string; sub: string }[] = [
  { uc: "d2a", mode: "air", title: "Home → Airport", sub: "Bags reach the airport before you do" },
  { uc: "a2d", mode: "air", title: "Airport → Home", sub: "Land and leave, we bring them home" },
  { uc: "h2a", mode: "air", title: "Hotel → Airport", sub: "Check out light" },
  { uc: "h2h", mode: "road", title: "Hotel → Hotel", sub: "Next city, same bags" },
  { uc: "d2d", mode: "road", title: "Door → Door", sub: "City to city, by road" },
  { uc: "rail", mode: "rail", title: "Railway station", sub: "Vande Bharat, Rajdhani" },
  { uc: "cruise", mode: "sea", title: "Cruise terminal", sub: "Mumbai, Goa, Kochi sailings" },
];
const SLOTS = ["06:00–08:00", "08:00–10:00", "10:00–12:00", "12:00–14:00", "16:00–18:00", "18:00–20:00"];
const STEPS = ["Service", "Route", "When", "Bags", "You", "Verify", "Review"];

interface Draft {
  uc: UseCase; mode: Mode;
  from: string; to: string; fromOther: string; toOther: string;
  pickAddr: string; dropAddr: string;
  date: string; slot: string; flight: string;
  bags: number; oversize: number;
  name: string; mobile: string; email: string; note: string;
}

interface OtpState {
  channel: "mobile" | "email";
  sent: boolean; exp: number; token: string; entered: string; sentTo?: string;
  demo?: string; verifiedAt: string | null; err: string | null; busy: boolean;
}
const OTP0: OtpState = { channel: "mobile", sent: false, exp: 0, token: "", entered: "", verifiedAt: null, err: null, busy: false };

export default function RequestWizard() {
  const [step, setStep] = useState(0);
  const [today, setToday] = useState("");
  const [d, setD] = useState<Draft>({
    uc: "d2a", mode: "air", from: "Ahmedabad", to: "Mumbai", fromOther: "", toOther: "",
    pickAddr: "", dropAddr: "", date: "", slot: "", flight: "",
    bags: 2, oversize: 0, name: "", mobile: "", email: "", note: "",
  });
  useEffect(() => {
    const now = Date.now();
    setToday(new Date(now).toISOString().slice(0, 10));
    setD((p) => (p.date ? p : { ...p, date: new Date(now + 4 * 86400000).toISOString().slice(0, 10) }));
  }, []);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const fromName = d.from === "other" ? d.fromOther || "Other city" : d.from;
  const toName = d.to === "other" ? d.toOther || "Other city" : d.to;
  const mobileOk = /^\+?[\d\s-]{10,15}$/.test(d.mobile.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim());

  /* booking-time OTP — same server engine as the live wizard */
  const [otp, setOtp] = useState<OtpState>(OTP0);
  const otpDest = otp.channel === "email" ? d.email.trim() : d.mobile.trim();
  async function sendOtp(channel: "mobile" | "email") {
    const to = channel === "email" ? d.email.trim() : d.mobile.trim();
    setOtp({ ...OTP0, channel, busy: true });
    try {
      const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", channel, to }) });
      const j = await r.json();
      if (j.error) setOtp((p) => ({ ...p, busy: false, err: j.detail ?? "Could not send the code — check the details and try again." }));
      else setOtp((p) => ({ ...p, busy: false, sent: true, exp: j.exp, token: j.token, demo: j.demo, sentTo: j.to }));
    } catch { setOtp((p) => ({ ...p, busy: false, err: "Could not reach the server — try again." })); }
  }
  async function verifyOtp() {
    setOtp((p) => ({ ...p, busy: true, err: null }));
    try {
      const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", to: otp.sentTo ?? otpDest, code: otp.entered, exp: otp.exp, token: otp.token }) });
      const j = await r.json();
      if (j.error) setOtp((p) => ({ ...p, busy: false, err: "That code didn't match or has expired — try again, or resend." }));
      else setOtp((p) => ({ ...p, busy: false, verifiedAt: j.at }));
    } catch { setOtp((p) => ({ ...p, busy: false, err: "Could not reach the server — try again." })); }
  }
  useEffect(() => { setOtp(OTP0); }, [d.mobile, d.email]);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [live, setLive] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!booking) return;
    return watchBooking(booking.id, setLive);
  }, [booking]);

  async function submit() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const id = newBookingId();
      const fromCity = CITIES.find((c) => c.name === fromName);
      const toCity = CITIES.find((c) => c.name === toName);
      const now = nowIso();
      const doc: Booking = {
        id, created: now, status: "submitted",
        uc: d.uc, ucName: SERVICES.find((s) => s.uc === d.uc)?.title ?? d.uc, mode: d.mode,
        from: fromName, to: toName, pickAddr: d.pickAddr.trim(), dropAddr: d.dropAddr.trim(),
        zo: fromCity?.zone ?? "", zd: toCity?.zone ?? "",
        date: d.date, ref: d.flight.trim().toUpperCase(), slot: d.slot,
        bags: d.bags, oversize: d.oversize, billed: Math.max(d.bags + d.oversize, 1),
        traveller: { name: d.name.trim(), mobile: d.mobile.trim(), email: d.email.trim(), res: "in" },
        payer: null, note: d.note.trim(), source: "website · request",
        /* no amount is quoted on the site — the team confirms personally */
        quote: { qid: null, total: 0, breakdown: { ror: true } },
        identity: { ok: false, at: "", method: "UIDAI Aadhaar OTP · pending (required before pickup)", score: 0 },
        pay: null, admin: {},
        events: [
          { at: now, by: "customer", text: `Booking request confirmed with ${otp.channel} OTP (${otp.channel === "email" ? d.email.trim() : d.mobile.trim()})` },
          { at: now, by: "customer", text: "Booking request · rate to be confirmed personally by the team · Aadhaar verification pending" },
        ],
      };
      const saved = await createBooking(doc);
      setBooking(saved);
    } catch {
      setErr("Something went wrong saving your request — please try again.");
    } finally { setBusy(false); }
  }

  const canNext = [
    true,
    (!!d.pickAddr.trim() || d.uc === "a2d") && (d.from !== "other" || !!d.fromOther.trim()) && (d.to !== "other" || !!d.toOther.trim()),
    !!d.slot && !!d.date && d.date >= today,
    d.bags + d.oversize > 0,
    d.name.trim().length > 1 && mobileOk,
    !!otp.verifiedAt,
  ][step] ?? true;

  if (booking) {
    const st = live ?? booking;
    return (
      <Card className="mx-auto max-w-2xl anim-in">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-green-50 text-2xl text-green-700">✓</div>
          <h2 className="font-display text-2xl font-extrabold">Request received</h2>
          <p className="mt-1 text-sm text-muted">Reference <b className="font-mono">{booking.id}</b> — a Bagdrop specialist confirms your rate and pickup plan personally, usually within the hour.</p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[["1", "We call to confirm", "Your rate and pickup plan, person to person"], ["2", "Secure payment link", "Pay only after you approve the plan"], ["3", "Aadhaar, then pickup", "One-minute UIDAI check before the captain arrives"]].map(([n, t, s]) => (
            <div key={n} className="rounded-xl bg-paper p-3 text-center">
              <span className="mx-auto mb-1.5 flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
              <b className="block text-[13px]">{t}</b>
              <span className="text-xs text-muted">{s}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          {st.status === "submitted" ? "With Bagdrop operations — you will hear from us shortly on WhatsApp and email." : `Status: ${st.status.replace("_", " ")}.`}
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
          {step < 6 && <span className="text-[11px] text-faint">no payment on this page</span>}
        </div>
        <ol className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-brand" : "bg-line"}`} title={s} />
          ))}
        </ol>

        <div key={step} className="anim-in">
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
              {d.from === "other" && <Field label="Your pickup city"><Input value={d.fromOther} onChange={(e) => set("fromOther", e.target.value)} placeholder="Type the city" /></Field>}
              {d.to === "other" && <Field label="Your delivery city"><Input value={d.toOther} onChange={(e) => set("toOther", e.target.value)} placeholder="Type the city" /></Field>}
              <Field label="Pickup address"><Input value={d.pickAddr} onChange={(e) => set("pickAddr", e.target.value)} placeholder="Flat, building, area or pincode" /></Field>
              <Field label="Delivery address"><Input value={d.dropAddr} onChange={(e) => set("dropAddr", e.target.value)} placeholder="Hotel, home, terminal" /></Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <H>Travel details</H>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label={d.mode === "air" ? "Flight number" : "Reference (optional)"}>
                <Input value={d.flight} onChange={(e) => set("flight", e.target.value)} placeholder="6E 5219" />
              </Field>
              <Field label="Travel date">
                <Input type="date" value={d.date} min={today} onChange={(e) => set("date", e.target.value)} />
              </Field>
            </div>
            <p className="mb-2 text-xs text-muted">Pickup window</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SLOTS.map((s) => <Tile key={s} selected={d.slot === s} onClick={() => set("slot", s)} title={s} sub={s === "08:00–10:00" ? "most chosen" : ""} />)}
            </div>
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
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Input className="w-36 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp.entered} onChange={(e) => setOtp((p) => ({ ...p, entered: e.target.value, err: null }))} placeholder="••••••" />
                  <Button disabled={otp.busy || otp.entered.trim().length !== 6} onClick={() => void verifyOtp()}>{otp.busy ? "Checking…" : "Verify"}</Button>
                  <Button variant="ghost" size="sm" disabled={otp.busy} onClick={() => void sendOtp(otp.channel)}>Resend</Button>
                </div>
                <p className="mt-2 text-xs text-muted">Code sent to {otpDest}.{otp.demo ? <span className="font-mono"> (demo: {otp.demo})</span> : null}</p>
              </>
            )}
            {otp.verifiedAt && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>Confirmed</b> · {otp.channel} verified · your request is made against this contact.</p>}
            {otp.err && <p className="mt-2 text-sm text-red-700">{otp.err}</p>}
          </>
        )}

        {step === 6 && (
          <>
            <H>Review &amp; submit</H>
            <div className="mb-4 grid gap-1.5 rounded-xl bg-paper p-4 text-sm">
              {([
                ["Service", SERVICES.find((s) => s.uc === d.uc)?.title],
                ["Route", `${fromName} → ${toName}`],
                ["Travel", `${d.date}${d.flight ? ` · ${d.flight.toUpperCase()}` : ""} · ${d.slot}`],
                ["Pieces", `${d.bags} bags${d.oversize ? ` + ${d.oversize} oversize` : ""}`],
                ["Traveller", `${d.name} · ${d.mobile}`],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>
              ))}
            </div>
            <p className="mb-4 text-sm text-muted">
              No payment is taken now. A Bagdrop specialist confirms your rate and pickup plan personally, then sends a secure payment link. Aadhaar verification follows payment, before pickup.
            </p>
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit booking request"}</Button>
            {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
          </>
        )}

        </div>

        <div className="mt-6 flex justify-between gap-3">
          {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step < 6 && <Button className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>}
        </div>
      </Card>

      {/* summary — no amounts anywhere */}
      <aside>
        <Card className="lg:sticky lg:top-6">
          <h3 className="mb-2 font-display text-sm font-bold">Your booking</h3>
          {([
            ["Service", SERVICES.find((s) => s.uc === d.uc)?.title],
            ["Route", `${fromName} → ${toName}`],
            ["Travel", `${d.date}${d.flight ? ` · ${d.flight.toUpperCase()}` : ""}`],
            ["Pickup", d.slot || "—"],
            ["Pieces", `${d.bags} bags${d.oversize ? ` + ${d.oversize} oversize` : ""}`],
            ["Traveller", d.name || "—"],
            ["Contact", otp.verifiedAt ? `verified · ${otp.channel}` : "verify at step 6"],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
              <span className="text-muted">{k}</span><span className="text-right">{v}</span>
            </div>
          ))}
          <div className="mt-3 rounded-xl bg-ink p-4 text-cream">
            <p className="font-mono text-[11px] opacity-75">How it works</p>
            {[["1", "Captain seals & tags each bag with you at the door"], ["2", "Every tag is scanned at each hand-off — track live"], ["3", "Released only against your verified identity"]].map(([n, t]) => (
              <div key={n} className="mt-2.5 flex items-start gap-2 text-xs leading-snug">
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{n}</span>
                <span className="opacity-90">{t}</span>
              </div>
            ))}
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px]">
              {["Sealed", "Insured", "Verified"].map((t) => (
                <span key={t} className="rounded-lg bg-white/10 px-1 py-1.5">{t}</span>
              ))}
            </div>
          </div>
        </Card>
      </aside>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 font-display text-2xl font-extrabold tracking-tight">{children}<span className="mb-4 block" /></h2>;
}
