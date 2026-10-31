"use client";
/** The client dashboard — every booking for the signed-in mobile/email:
 *  the team's decision, the price, the payment panel once approved, proof
 *  upload (screenshot + UTR) or online payment (Razorpay Standard Checkout:
 *  /api/create-order → checkout modal → /api/verify-payment), and bag/date
 *  changes within the rules the server enforces (/api/account). Sign-in is
 *  by OTP only. */
import { useCallback, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import Link from "next/link";
import { inr } from "@/lib/pricing";
import { Badge, Button, Card, Field, Input, Tile } from "@/components/ui";
import UpiPay, { type PayTo } from "@/components/UpiPay";
import OnlinePay from "@/components/OnlinePay";

interface View {
  id: string; created: string; status: string;
  decision: { state: string; note?: string; at?: string };
  service: string; mode: string; from: string; to: string; pickAddr: string; dropAddr: string;
  date: string; slot: string; ref: string; deliveryDate: string | null; bags: number; oversize: number;
  priced: boolean; total: number; validUntil: string | null;
  pay: null | { status: string; amount: number; utr?: string; rejectedNote?: string; hasProof: boolean; topup: null | { amount: number; status: string; rejectedNote?: string; hasProof: boolean } };
  paid: boolean; balanceDue: number; identityOk: boolean; indemnitySigned: boolean;
  canEdit: boolean; canPay: boolean; locked: boolean;
}

const WA = "https://wa.me/916357115711?text=";

export default function AccountClient() {
  const [state, setState] = useState<"loading" | "login" | "ready">("loading");
  const [who, setWho] = useState("");
  const [list, setList] = useState<View[]>([]);
  const [payTo, setPayTo] = useState<PayTo>({});
  const [gateway, setGateway] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/account", { cache: "no-store" });
    if (r.status === 401) { setState("login"); return; }
    const j = await r.json();
    if (j.error) { setState("login"); return; }
    setWho(j.identity); setList(j.bookings); setPayTo(j.payTo ?? {}); setGateway(!!j.gateway); setState("ready");
  }, []);
  useLoad(load);

  async function logout() {
    await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setList([]); setState("login");
  }

  return (
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="font-display text-lg font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span></Link>
          {state === "ready" && <span className="flex items-center gap-3 text-xs text-muted"><span className="hidden sm:inline">{who}</span><Link href="/#book"><Button size="sm">+ New booking</Button></Link><Button size="sm" variant="ghost" onClick={() => void logout()}>Sign out</Button></span>}
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-4 pt-8">
        {state === "loading" && <p className="text-sm text-muted">Opening your dashboard…</p>}
        {state === "login" && <Login onDone={load} />}
        {state === "ready" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-2xl font-extrabold tracking-tight">My bookings</h1>
              <Link href="/#book"><Button>+ Book a new pickup</Button></Link>
            </div>
            <p className="mb-5 text-sm text-muted">Every booking made with {who}. Payment opens once our team approves a booking.</p>
            <PayReturnBanner />
            {list.length === 0 && <Card><p className="py-6 text-center text-sm text-muted">No bookings yet. <Link className="font-semibold text-brand underline" href="/#book">Book a pickup →</Link></p></Card>}
            <div className="grid gap-4">{list.map((b) => <BookingCard key={b.id} b={b} payTo={payTo} gateway={gateway} onChanged={load} />)}</div>
          </>
        )}
      </section>
    </main>
  );
}

/** Shown after Razorpay sends the customer back from a payment link. */
function PayReturnBanner() {
  const [state] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("pay")));
  if (!state) return null;
  const t = state === "paid" ? ["bg-green-50 text-green-900", "Payment received and confirmed — thank you! Your booking below is updated."]
    : state === "pending" ? ["bg-amber-50 text-amber-900", "Payment received — we're confirming it with the bank. This page updates within a few minutes."]
    : ["bg-red-50 text-red-900", "We couldn't confirm that payment. If money left your account, contact us with the payment ID from Razorpay."];
  return <p className={`mb-4 rounded-xl p-3 text-sm ${t[0]}`}>{t[1]}</p>;
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [channel, setChannel] = useState<"mobile" | "email">("mobile");
  const [to, setTo] = useState("");
  const [otp, setOtp] = useState<{ sent: boolean; exp: number; token: string; sentTo?: string; demo?: string; code: string }>({ sent: false, exp: 0, token: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", channel, to }) });
      const j = await r.json();
      if (j.error) setErr(j.detail ?? (channel === "email" ? "That email doesn't look right." : "That mobile number doesn't look right."));
      else setOtp({ sent: true, exp: j.exp, token: j.token, sentTo: j.to, demo: j.demo, code: "" });
    } finally { setBusy(false); }
  }
  async function login() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", otp: { to: otp.sentTo, code: otp.code.trim(), exp: otp.exp, token: otp.token } }) });
      const j = await r.json();
      if (j.error) setErr(j.error === "OTP_USED" ? "That code was already used — request a new one." : "That code didn't match or has expired.");
      else await onDone();
    } finally { setBusy(false); }
  }
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="font-display text-xl font-extrabold">Sign in to your bookings</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Use the mobile or email you booked with. We send a one-time code — no password needed.</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Tile selected={channel === "mobile"} onClick={() => { setChannel("mobile"); setOtp({ sent: false, exp: 0, token: "", code: "" }); }} title="Mobile" sub="WhatsApp / SMS" />
        <Tile selected={channel === "email"} onClick={() => { setChannel("email"); setOtp({ sent: false, exp: 0, token: "", code: "" }); }} title="Email" sub="code by email" />
      </div>
      <Field label={channel === "mobile" ? "Mobile number" : "Email address"}>
        <Input value={to} onChange={(e) => setTo(e.target.value)} inputMode={channel === "mobile" ? "tel" : "email"} placeholder={channel === "mobile" ? "+91 98XXX XXXXX" : "you@example.com"} />
      </Field>
      {!otp.sent ? (
        <Button className="w-full" disabled={busy || !to.trim()} onClick={() => void send()}>{busy ? "Sending…" : "Send code"}</Button>
      ) : (
        <>
          <div className="flex gap-2">
            <Input className="font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp.code} onChange={(e) => setOtp((p) => ({ ...p, code: e.target.value }))} placeholder="••••••" />
            <Button disabled={busy || otp.code.trim().length !== 6} onClick={() => void login()}>{busy ? "…" : "Sign in"}</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Code sent.{otp.demo ? <span className="font-mono"> (demo: {otp.demo})</span> : null} <button className="font-semibold text-brand underline" onClick={() => void send()}>Resend</button></p>
        </>
      )}
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </Card>
  );
}

const DECISION: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  pending: { label: "Awaiting team review", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  hold: { label: "On hold", tone: "warn" },
  info: { label: "Information needed", tone: "warn" },
  rejected: { label: "Not accepted", tone: "bad" },
};

function BookingCard({ b, payTo, gateway, onChanged }: { b: View; payTo: PayTo; gateway: boolean; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const dec = DECISION[b.decision.state] ?? DECISION.pending;
  const stage = b.paid ? (b.identityOk ? "Verified · ready for pickup" : "Payment verified") : b.pay?.status === "submitted" ? "Payment under verification" : dec.label;
  return (
    <Card className="anim-in">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted">{b.id}</p>
          <b className="font-display text-[15px]">{b.from} → {b.to}</b>
          <p className="text-xs text-muted">{b.service} · pickup {b.date}{b.slot ? ` · ${b.slot}` : ""} · {b.bags} bag(s){b.oversize ? ` + ${b.oversize} oversize` : ""}</p>
        </div>
        <div className="text-right">
          <Badge tone={b.paid ? "ok" : dec.tone}>{stage}</Badge>
          <p className="mt-1 font-display text-lg font-extrabold">{b.priced ? inr(b.total) : "Rate on request"}</p>
        </div>
      </div>

      {b.decision.note && ["hold", "info", "rejected"].includes(b.decision.state) && (
        <p className={`mt-3 rounded-xl p-3 text-sm ${b.decision.state === "rejected" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
          <b>{b.decision.state === "info" ? "Our team asks:" : b.decision.state === "hold" ? "On hold:" : "Reason:"}</b> {b.decision.note}
          {b.decision.state === "info" && <> — <a className="font-semibold underline" href={`${WA}${encodeURIComponent(`Re ${b.id}: `)}`} target="_blank" rel="noreferrer">reply on WhatsApp</a></>}
        </p>
      )}
      {b.decision.state === "pending" && !b.paid && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{b.priced ? "Our team is reviewing your booking — payment details appear here as soon as it's approved." : "New sector — our team is preparing your rate. You'll see it here and on WhatsApp/email."}</p>}

      {/* payment: invited only once approved */}
      {b.canPay && !b.paid && <PaySection b={b} payTo={payTo} gateway={gateway} kind="full" amount={b.total} onChanged={onChanged} />}
      {b.pay?.status === "submitted" && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>Payment proof received</b>{b.pay.utr ? ` (UTR ${b.pay.utr})` : ""} — finance is verifying it against the bank. You&apos;ll be notified.</p>}
      {b.paid && b.pay?.topup?.status === "submitted" && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>Extra payment proof received</b> — being verified.</p>}
      {b.paid && b.canPay && b.pay?.topup && <PaySection b={b} payTo={payTo} gateway={gateway} kind="topup" amount={b.pay.topup.amount} onChanged={onChanged} />}

      {b.paid && (
        <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
          <b>Payment of {inr(b.pay!.amount)} verified.</b>{" "}
          {b.identityOk ? "Bond signed and identity verified — you're all set for pickup." : <>Next, before pickup: sign the baggage declaration &amp; indemnity bond — <a className="font-semibold underline" href={`/verify/${b.id}`}>sign now →</a></>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {b.canEdit && <Button size="sm" variant="outline" onClick={() => setEdit((v) => !v)}>{edit ? "Close" : b.locked ? "Add bags" : "Change bags or date"}</Button>}
        <a href={`${WA}${encodeURIComponent(`Hi Bagdrop, about booking ${b.id}: `)}`} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Contact the Bagdrop team</Button></a>
      </div>
      {edit && <EditBox b={b} onDone={async () => { setEdit(false); await onChanged(); }} />}
    </Card>
  );
}

function PaySection({ b, payTo, gateway, kind, amount, onChanged }: { b: View; payTo: PayTo; gateway: boolean; kind: "full" | "topup"; amount: number; onChanged: () => Promise<void> }) {
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rejected = kind === "full" ? b.pay?.status === "rejected" ? b.pay.rejectedNote : null : b.pay?.topup?.status === "rejected" ? b.pay.topup.rejectedNote : null;
  async function submit() {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("id", b.id); fd.append("kind", kind); fd.append("utr", utr.trim());
      if (file) fd.append("file", file);
      const r = await fetch("/api/account", { method: "POST", body: fd });
      const j = await r.json();
      if (j.error) setErr(j.detail ?? "Could not submit — try again.");
      else await onChanged();
    } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 grid gap-3">
      {kind === "topup" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><b>Extra bags added</b> — {inr(amount)} more to pay.</p>}
      {rejected && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Your last proof couldn&apos;t be verified:</b> {rejected}. Please check and upload again.</p>}
      {gateway && <OnlinePay bookingId={b.id} kind={kind} amount={amount} onPaid={onChanged} />}
      {gateway ? (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">Paid another way? Bank transfer or UPI to our account — share the proof</summary>
          <div className="mt-3 grid gap-3"><ManualPay b={b} payTo={payTo} kind={kind} amount={amount} utr={utr} setUtr={setUtr} file={file} setFile={setFile} busy={busy} submit={submit} err={err} /></div>
        </details>
      ) : <ManualPay b={b} payTo={payTo} kind={kind} amount={amount} utr={utr} setUtr={setUtr} file={file} setFile={setFile} busy={busy} submit={submit} err={err} />}
    </div>
  );
}

function ManualPay({ b, payTo, amount, utr, setUtr, setFile, file, busy, submit, err }: {
  b: View; payTo: PayTo; kind: "full" | "topup"; amount: number; utr: string; setUtr: (v: string) => void;
  file: File | null; setFile: (f: File | null) => void; busy: boolean; submit: () => Promise<void>; err: string | null;
}) {
  return (
    <>
      <UpiPay amount={amount} reference={b.id} payTo={payTo} />
      <div className="rounded-xl border border-line p-3">
        <p className="mb-2 text-sm font-semibold">After paying, share your proof</p>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="UTR / transaction ID"><Input className="font-mono" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. 4321 8765 1234" /></Field>
          <Field label="Payment screenshot (image or PDF, max 5 MB)">
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-2 file:text-xs file:font-semibold" />
          </Field>
        </div>
        <Button disabled={busy || (!utr.trim() && !file)} onClick={() => void submit()}>{busy ? "Submitting…" : `I've paid ${inr(amount)} — submit proof`}</Button>
        {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      </div>
    </>
  );
}

function EditBox({ b, onDone }: { b: View; onDone: () => Promise<void> }) {
  const [bags, setBags] = useState(b.bags);
  const [oversize, setOversize] = useState(b.oversize);
  const [date, setDate] = useState(b.date);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", id: b.id, bags, oversize, date }) });
      const j = await r.json();
      if (j.error) setMsg(j.detail ?? "Could not save that change.");
      else { if (j.note) setMsg(j.note); await onDone(); }
    } finally { setBusy(false); }
  }
  const counter = (label: string, v: number, set: (n: number) => void, min: number) => (
    <div className="flex items-center justify-between rounded-xl border border-line p-2.5">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={v <= min} onClick={() => set(Math.max(min, v - 1))}>−</Button>
        <b className="w-6 text-center">{v}</b>
        <Button size="sm" variant="outline" onClick={() => set(v + 1)}>+</Button>
      </span>
    </div>
  );
  return (
    <div className="mt-3 grid gap-2 rounded-xl bg-paper p-3">
      {b.locked && <p className="text-xs text-muted">After payment you can only <b>add</b> bags — the extra amount is shown for payment. To reduce bags or change the date, contact the Bagdrop team.</p>}
      {counter("Bags", bags, setBags, b.locked ? b.bags : 0)}
      {counter("Oversize", oversize, setOversize, b.locked ? b.oversize : 0)}
      {!b.locked && <Field label="Pickup date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save change"}</Button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
