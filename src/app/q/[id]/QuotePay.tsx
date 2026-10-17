"use client";
/** The shared quote link: /q/BD-2026-XXXX — opens the quote, pays against the
 *  SERVER-VERIFIED signature. A tampered figure is refused by /api/pay. */
import { useEffect, useState } from "react";
import { inr } from "@/lib/pricing";
import { getBooking, updateBooking, watchBooking } from "@/lib/db";
import type { Booking } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";

export default function QuotePay({ id }: { id: string }) {
  const [b, setB] = useState<Booking | null | "loading">("loading");
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    void getBooking(id).then((d) => setB(d));
    return watchBooking(id, (d) => { if (d) setB(d); });
  }, [id]);

  if (b === "loading") return <Card className="mx-auto max-w-xl text-center text-muted">Loading the quote…</Card>;
  if (!b) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h2 className="font-display text-xl font-extrabold">That quote link is not valid any more.</h2>
        <p className="mt-2 text-sm text-muted">Ask the team to re-share it, or get a fresh price in two minutes on the booking page.</p>
      </Card>
    );
  }

  const expired = !!b.quote.validUntil && new Date(b.quote.validUntil).getTime() < Date.now();
  const paid = !!b.pay;

  async function pay(mode: "full" | "hold") {
    if (!b || b === "loading") return;
    const bk: Booking = b;
    setPaying(true); setErr("");
    const res = await fetch("/api/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qid: bk.quote.qid, fromName: bk.from, toName: bk.to,
        bags: bk.bags, oversize: bk.oversize,
        total: bk.quote.total, validUntil: bk.quote.validUntil,
        signature: bk.quote.signature, mode,
      }),
    });
    const j = await res.json();
    setPaying(false);
    if (!res.ok || j.error) { setErr(j.detail ?? j.error ?? "Payment failed"); return; }
    const updated = await updateBooking(
      bk.id,
      { status: "submitted", pay: { mode, amount: j.amount, status: "captured", gateway: j.gateway, at: j.capturedAt } },
      `Paid ${inr(j.amount)} via quote link · signature verified server-side · ${j.reference}`
    );
    setB(updated);
  }

  return (
    <Card className="mx-auto max-w-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Your Bagdrop quote</p>
          <h2 className="font-display text-2xl font-extrabold">{b.traveller.title ? `${b.traveller.title} ` : ""}{b.traveller.name || "Traveller"}</h2>
          <p className="font-mono text-xs text-muted">{b.quote.qid ?? b.id} · {b.id}</p>
        </div>
        <Badge tone={paid ? "ok" : expired ? "bad" : "info"}>{paid ? "paid" : expired ? "expired" : "server-signed"}</Badge>
      </div>

      {([
        ["Service", b.ucName],
        ["Route", `${b.from} → ${b.to}`],
        ["Travel", `${b.date}${b.ref ? ` · ${b.ref}` : ""}${b.flightTime ? ` · ${b.flightTime}` : ""}`],
        ["Pieces", `${b.bags} bag(s)${b.oversize ? ` + ${b.oversize} oversize` : ""} · billed ${b.billed}`],
        ["Includes", b.quote.breakdown.gst ? `GST 5% ${inr(b.quote.breakdown.gst)}` : "GST 5%"],
      ] as const).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-dashed border-line py-2 text-sm last:border-0">
          <span className="text-muted">{k}</span><span className="text-right">{v}</span>
        </div>
      ))}

      <p className="my-4 text-center font-display text-4xl font-extrabold">{inr(b.quote.total)}</p>
      {b.quote.validUntil && !paid && !expired && (
        <p className="mb-4 text-center text-xs text-muted">
          Price locked until {new Date(b.quote.validUntil).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {paid ? (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
          <b>Paid</b> · {inr(b.pay!.amount)} via {b.pay!.gateway}. {b.pay!.amount < b.quote.total ? `Balance ${inr(b.quote.total - b.pay!.amount)} at pickup.` : "Booking is with operations."}
        </p>
      ) : expired ? (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">This price lock has expired — message the team and a fresh quote arrives in a minute.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="outline" disabled={paying} onClick={() => void pay("hold")}>Hold with 20% · {inr(Math.round(b.quote.total * 0.2))}</Button>
          <Button disabled={paying} onClick={() => void pay("full")}>{paying ? "Verifying signature…" : `Pay ${inr(b.quote.total)}`}</Button>
        </div>
      )}
      {err && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Refused:</b> {err}</p>}
      <p className="mt-4 text-center text-[11px] text-faint">The server verifies the quote signature before capture — a price edited in the browser is refused.</p>
    </Card>
  );
}
