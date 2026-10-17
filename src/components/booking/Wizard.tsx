"use client";
/** The customer booking wizard — the migration template for every other page.
 *  Pattern: typed draft state → pure pricing preview → SERVER-SIGNED quote
 *  (/api/quote) → booking saved in the shared Admin OS shape. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CITIES, inr, quote } from "@/lib/pricing";
import { createBooking, newBookingId, nowIso, watchBooking } from "@/lib/db";
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
const SLOTS = ["06:00–08:00", "08:00–10:00", "10:00–12:00", "12:00–14:00", "16:00–18:00", "18:00–20:00"];
const STEPS = ["Service", "Route", "When", "Bags", "You", "Price", "Verify", "Pay"];
const AAD_DEMO = "112233";

interface Draft {
  uc: UseCase; mode: Mode;
  from: string; to: string; fromOther: string; toOther: string;
  pickAddr: string; dropAddr: string;
  date: string; slot: string; flight: string;
  bags: number; oversize: number;
  name: string; mobile: string; email: string; note: string;
}

export default function Wizard() {
  const [step, setStep] = useState(0);
  const [today, setToday] = useState("");
  const [d, setD] = useState<Draft>({
    uc: "d2a", mode: "air", from: "Ahmedabad", to: "Mumbai", fromOther: "", toOther: "",
    pickAddr: "", dropAddr: "", date: "", slot: "", flight: "",
    bags: 2, oversize: 0, name: "", mobile: "", email: "", note: "",
  });
  /* dates come from the clock, which prerender forbids — set them on mount */
  useEffect(() => {
    const now = Date.now();
    setToday(new Date(now).toISOString().slice(0, 10));
    setD((p) => (p.date ? p : { ...p, date: new Date(now + 4 * 86400000).toISOString().slice(0, 10) }));
  }, []);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const fromName = d.from === "other" ? d.fromOther || "Other city" : d.from;
  const toName = d.to === "other" ? d.toOther || "Other city" : d.to;
  const isOther = d.from === "other" || d.to === "other";

  /** instant client preview (display only — the signed figure rules) */
  const preview = useMemo(
    () => (isOther ? { error: "RATE_ON_REQUEST" as const } : quote({ fromName, toName, bags: d.bags, oversize: d.oversize, mode: d.mode, date: d.date })),
    [fromName, toName, d.bags, d.oversize, d.mode, d.date, isOther]
  );
  const ror = "error" in preview;

  /** server-signed quote */
  const [signed, setSigned] = useState<SignedQuote | null>(null);
  const [otp, setOtp] = useState<{ code: string; entered: string; sent: boolean }>({ code: "", entered: "", sent: false });
  const unlocked = ror || (!!signed && otp.entered === otp.code && otp.sent);

  const fetchSigned = useCallback(async () => {
    if (ror) return;
    const r = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromName, toName, bags: d.bags, oversize: d.oversize, mode: d.mode, date: d.date }),
    });
    const j = await r.json();
    if (!j.error) setSigned(j as SignedQuote);
  }, [ror, fromName, toName, d.bags, d.oversize, d.mode, d.date]);

  useEffect(() => { if (step === 5) void fetchSigned(); }, [step, fetchSigned]);

  /** identity + booking */
  const [idOk, setIdOk] = useState(false);
  const [aad, setAad] = useState({ shown: false, code: "" });
  const [booking, setBooking] = useState<Booking | null>(null);
  const [live, setLive] = useState<Booking | null>(null);
  useEffect(() => {
    if (!booking) return;
    return watchBooking(booking.id, setLive);
  }, [booking]);

  async function submit() {
    const id = newBookingId();
    const fromCity = CITIES.find((c) => c.name === fromName);
    const toCity = CITIES.find((c) => c.name === toName);
    const total = ror ? 0 : signed?.total ?? 0;
    const doc: Booking = {
      id, created: nowIso(), status: "submitted",
      uc: d.uc, ucName: SERVICES.find((s) => s.uc === d.uc)?.title ?? d.uc, mode: d.mode,
      from: fromName, to: toName, pickAddr: d.pickAddr, dropAddr: d.dropAddr,
      zo: fromCity?.zone ?? "", zd: toCity?.zone ?? "",
      date: d.date, ref: d.flight.toUpperCase(), slot: d.slot,
      bags: d.bags, oversize: d.oversize, billed: ror ? Math.max(d.bags + d.oversize, 1) : signed?.billed ?? d.bags,
      traveller: { name: d.name, mobile: d.mobile, email: d.email, res: "in" },
      payer: null, note: d.note, source: "website · next",
      quote: ror
        ? { qid: null, total: 0, breakdown: { ror: true } }
        : { qid: signed!.qid, total, breakdown: signed!, validUntil: signed!.validUntil, signature: signed!.signature },
      identity: { ok: true, at: nowIso(), method: "DigiLocker (demo)", score: 0.97 },
      pay: ror ? null : { mode: "full", amount: total, status: "captured", gateway: "Razorpay (demo)", at: nowIso() },
      admin: {},
      events: [{ at: nowIso(), by: "customer", text: ror ? "Booking request · RATE ON REQUEST" : `Paid ${inr(total)} against signed quote ${signed!.qid}` }],
    };
    const saved = await createBooking(doc);
    setBooking(saved);
  }

  /* ---------- step validity ---------- */
  const canNext = [
    true,
    !!d.pickAddr || d.uc === "a2d",
    !!d.slot,
    d.bags + d.oversize > 0,
    d.name.length > 1 && /^\+?[\d\s-]{10,15}$/.test(d.mobile),
    unlocked,
    idOk,
  ][step] ?? true;

  if (booking) {
    const st = live ?? booking;
    const stages = ["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered"];
    const idx = stages.indexOf(st.status);
    return (
      <Card className="mx-auto max-w-2xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-green-50 text-2xl text-green-700">✓</div>
          <h2 className="font-display text-2xl font-extrabold">Booked. Your bags are on the plan.</h2>
          <p className="mt-1 text-sm text-muted">Reference <b className="font-mono">{booking.id}</b> · live status below updates as ops works.</p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {["Booked", "Accepted", "Captain", "Picked up", "In transit", "Delivered"].map((s, i) => (
            <div key={s} className={`rounded-lg p-2 text-center text-[11px] ${i <= idx ? "bg-green-50 text-green-800" : "bg-paper text-muted"}`}>{s}</div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          {st.status === "accepted" && `Confirmed · captain ${String((st.admin as { captain?: string }).captain ?? "to be assigned")} · pickup ${st.slot} on ${st.date}.`}
          {st.status === "submitted" && (st.quote.breakdown.ror ? "Request received — the team calls with the rate for your route." : "Sent to Bagdrop operations — you will hear within the hour.")}
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
            <H>What are we carrying for you?</H>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {SERVICES.map((s) => (
                <Tile key={s.uc} selected={d.uc === s.uc} onClick={() => { set("uc", s.uc); set("mode", s.mode); }} title={s.title} sub={s.sub} />
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <H>Where from, where to?</H>
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
            <H>How many pieces?</H>
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
            <H>Who is travelling?</H>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Full name (as on the ID you verify with)"><Input value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Mobile"><Input value={d.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 98XXX XXXXX" inputMode="tel" /></Field>
              <Field label="Email (optional)"><Input value={d.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
              <Field label="Anything we should know"><Input value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="Gate code, fragile item inside" /></Field>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <H>{ror ? "Rate on request" : "Your price"}</H>
            {ror ? (
              <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                No price to unlock — this route is not on our rate chart yet. Continue: no payment is taken, and the team confirms the rate before anything moves.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">One code to your mobile unlocks it and holds it for 24 hours. <Badge tone="ok">server-signed</Badge></p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button variant="outline" onClick={() => setOtp({ code: String(Math.floor(Math.random() * 900000) + 100000), entered: "", sent: true })}>Send code</Button>
                  <Input className="w-36 font-mono tracking-[.3em]" maxLength={6} value={otp.entered} onChange={(e) => setOtp((p) => ({ ...p, entered: e.target.value }))} placeholder="••••••" />
                </div>
                {otp.sent && <p className="mt-2 text-xs text-muted">Code sent to {d.mobile}. <span className="font-mono">(demo: {otp.code})</span></p>}
                {unlocked && signed && (
                  <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
                    <b>Locked</b> · {signed.qid} · {inr(signed.total)} until {new Date(signed.validUntil).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · signature {signed.signature.slice(0, 10)}…
                  </p>
                )}
              </>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <H>Verify the traveller</H>
            <p className="mb-4 text-sm text-muted">Once, before payment. We keep only a verified name and a reference — never the full ID.</p>
            {!aad.shown ? (
              <Tile selected={false} onClick={() => setAad({ shown: true, code: "" })} title="DigiLocker" sub="UIDAI sends an OTP to the mobile linked to Aadhaar. About a minute." />
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <Input className="w-36 font-mono tracking-[.3em]" maxLength={6} value={aad.code} onChange={(e) => setAad((p) => ({ ...p, code: e.target.value }))} placeholder="UIDAI OTP" />
                <Button disabled={aad.code !== AAD_DEMO} onClick={() => setIdOk(true)}>Confirm</Button>
                <span className="text-xs text-muted">(demo: {AAD_DEMO})</span>
              </div>
            )}
            {idOk && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>Verified</b> · DigiLocker · name matched 0.97.</p>}
          </>
        )}

        {step === 7 && (
          <>
            <H>{ror ? "Submit your request" : "Pay"}</H>
            <p className="mb-4 text-sm text-muted">
              {ror
                ? "No payment now — the team calls with the rate for your route."
                : "UPI, card or net banking. The server verifies the quote signature before capture — the browser can never set its own price."}
            </p>
            <Button size="lg" className="w-full" onClick={() => void submit()}>
              {ror ? "Submit booking request — no payment now" : `Pay ${signed ? inr(signed.total) : ""} securely (demo)`}
            </Button>
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
            ["Travel", `${d.date}${d.flight ? ` · ${d.flight.toUpperCase()}` : ""}`],
            ["Pickup", d.slot || "—"],
            ["Pieces", `${d.bags} bags${d.oversize ? ` + ${d.oversize} oversize` : ""}`],
            ["Traveller", d.name || "—"],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-0">
              <span className="text-muted">{k}</span><span className="text-right">{v}</span>
            </div>
          ))}
          <div className="relative mt-3 overflow-hidden rounded-xl bg-ink p-4 text-cream">
            <p className="font-mono text-[11px] opacity-75">{ror ? "Rate on request" : unlocked ? "Locked 24 h · server-signed" : "Price after one OTP"}</p>
            <div className={unlocked || ror ? "" : "pointer-events-none select-none blur-[7px]"}>
              <p className="font-display text-3xl font-extrabold">{ror ? "On request" : "error" in preview ? "—" : inr(preview.total)}</p>
              {!ror && !("error" in preview) && (
                <>
                  <p className="mb-2 text-xs opacity-75">{inr(preview.perBag)} per piece · {preview.billed} billed{preview.source === "route" ? " · rate chart" : ""}</p>
                  {([["Base", preview.base, preview.rule], ["Oversize", preview.oversize, ""], ["GST 5%", preview.gst, ""]] as const).map(([k, v, hint]) =>
                    v > 0 || k === "Base" ? (
                      <div key={k} className="flex justify-between border-b border-white/15 py-1 text-xs last:border-0">
                        <span className="opacity-80">{hint || k}</span><span className="font-mono">{inr(v)}</span>
                      </div>
                    ) : null
                  )}
                </>
              )}
              {ror && <p className="text-xs opacity-75">Our team calls with the rate for this route.</p>}
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
