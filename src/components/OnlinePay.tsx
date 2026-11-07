"use client";
import { useState } from "react";
import { inr } from "@/lib/pricing";
import { Button } from "@/components/ui";

/** Client-side preview only, for display before the order is created — the
 *  real amount is always decided server-side in /api/create-order (see
 *  gatewayFeeBreakdown there), which is what Razorpay and the booking record
 *  actually use. Kept at the same percentage by whoever sets the server
 *  env var; if they ever drift, the checkout amount (server) always wins. */
const PREVIEW_FEE_PCT = Math.max(0, Number(process.env.NEXT_PUBLIC_RAZORPAY_CONVENIENCE_FEE_PCT) || 0);

/* ---------- online payment · Razorpay Standard Checkout ---------- */
type RzpResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RzpFailure = { error?: { description?: string; reason?: string } };
declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (event: "payment.failed", cb: (r: RzpFailure) => void) => void } }
}
const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";
function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_JS; s.async = true;
    s.onload = () => resolve(!!window.Razorpay); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Pay online (all methods) or Scan & pay by UPI for one booking. The
 *  customer must be signed in (the booking route and My bookings set the
 *  session); the amount is decided server-side by /api/create-order. */
export default function OnlinePay({ bookingId, kind, amount, onPaid, fallbackHint = "or pay by UPI below" }: { bookingId: string; kind: "full" | "topup"; amount: number; onPaid: () => Promise<void> | void; fallbackHint?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function pay(upiOnly = false) {
    setBusy(true); setMsg(null);
    if (!(await loadCheckout())) { setMsg({ ok: false, text: `Couldn't open the payment window — check your connection, ${fallbackHint}.` }); setBusy(false); return; }
    const r = await fetch("/api/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bookingId, kind }) });
    const o = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, text: o.detail ?? "Couldn't start the payment — please try again." }); setBusy(false); return; }
    let settled = false;
    const rzp = new window.Razorpay!({
      key: o.key_id, order_id: o.order_id, amount: o.amount, currency: o.currency,
      name: o.name, description: o.description, prefill: o.prefill,
      notes: { bookingId }, theme: { color: "#EA580C" },
      /* "Scan & pay by UPI": only UPI — Razorpay shows a QR for this exact
       * amount (and UPI apps on mobile), confirmed automatically */
      ...(upiOnly ? { config: { display: { blocks: { upi: { name: "Pay by UPI", instruments: [{ method: "upi" }] } }, sequence: ["block.upi"], preferences: { show_default_blocks: false } } } } : {}),
      handler: async (resp: RzpResponse) => {
        settled = true;
        setMsg({ ok: true, text: "Payment received — confirming…" });
        const v = await fetch("/api/verify-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bookingId, ...resp }) });
        const j = await v.json().catch(() => ({}));
        if (v.ok && j.ok) { setMsg({ ok: true, text: "Payment confirmed. Thank you!" }); await onPaid(); }
        else if (v.status === 202) setMsg({ ok: true, text: j.detail ?? "Payment received — confirming with the bank." });
        else setMsg({ ok: false, text: `${j.detail ?? "We couldn't confirm this payment."} Payment ID: ${resp.razorpay_payment_id}` });
        setBusy(false);
      },
      modal: { ondismiss: () => { if (!settled) { setBusy(false); setMsg((m) => m ?? { ok: false, text: `Payment cancelled — you can try again, ${fallbackHint}.` }); } } },
    });
    rzp.on("payment.failed", (f: RzpFailure) => setMsg({ ok: false, text: `Payment failed: ${f.error?.description ?? "please try again"}.` }));
    rzp.open();
  }
  const previewFee = Math.round(amount * (PREVIEW_FEE_PCT / 100));
  const previewTotal = amount + previewFee;
  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft p-3">
      <p className="mb-2 text-sm font-semibold">Option 1 · Pay via Razorpay</p>
      {previewFee > 0 && (
        <div className="mb-2 rounded-lg bg-white/60 p-2 text-xs text-muted">
          <div className="flex justify-between"><span>Service price</span><span>{inr(amount)}</span></div>
          <div className="flex justify-between"><span>Razorpay convenience fee ({PREVIEW_FEE_PCT}%)</span><span>{inr(previewFee)}</span></div>
          <div className="flex justify-between font-semibold text-ink"><span>Total payable</span><span>{inr(previewTotal)}</span></div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="w-full" disabled={busy} onClick={() => void pay()}>{busy ? "Opening secure payment…" : `Pay ${inr(previewTotal)} online`}</Button>
        <Button className="w-full" variant="outline" disabled={busy} onClick={() => void pay(true)}>Scan &amp; pay by UPI (Razorpay)</Button>
      </div>
      <p className="mt-1.5 text-center text-xs text-muted">Card, UPI, netbanking or wallet · secured by Razorpay · confirmed instantly — no screenshot needed</p>
      {previewFee > 0 && (
        <p className="mt-1 text-center text-xs text-muted">A {PREVIEW_FEE_PCT}% Razorpay convenience fee applies to both buttons above. Pay with no extra fee via Option 2 (UPI QR / bank transfer) below.</p>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
