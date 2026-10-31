"use client";
/** The shared payment link /q/<id>. Reads the customer-safe summary from
 *  the server (never the raw booking). Payment is shown only once the team
 *  has approved the booking; proof upload happens in the client dashboard,
 *  where the client is signed in. Nothing here writes to the database. */
import { useEffect, useState } from "react";
import { withBase } from "@/lib/basePath";
import { inr } from "@/lib/pricing";
import { Badge, Button, Card } from "@/components/ui";
import UpiPay, { type PayTo } from "@/components/UpiPay";

interface V {
  id: string; name: string; status: string; decision: { state: string; note?: string };
  service: string; from: string; to: string; date: string; slot: string; bags: number; oversize: number;
  priced: boolean; total: number; validUntil: string | null;
  pay: null | { status: string; amount: number };
  paid: boolean; canPay: boolean; identityOk: boolean;
}

export default function QuotePay({ id }: { id: string }) {
  const [b, setB] = useState<V | null | "loading">("loading");
  const [payTo, setPayTo] = useState<PayTo>({});
  useEffect(() => {
    let dead = false;
    const load = () => fetch(`/api/booking?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (dead) return;
      if (j.error) setB(null); else { setB(j.booking); setPayTo(j.payTo ?? {}); }
    }).catch(() => { if (!dead) setB(null); });
    void load();
    const t = setInterval(load, 15000);
    return () => { dead = true; clearInterval(t); };
  }, [id]);

  if (b === "loading") return <Card className="mx-auto max-w-xl text-center text-muted">Loading your booking…</Card>;
  if (!b) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h2 className="font-display text-xl font-extrabold">That link isn&apos;t valid.</h2>
        <p className="mt-2 text-sm text-muted">Ask the team to re-share it, or open your dashboard.</p>
        <a href={withBase("/account")} className="mt-3 inline-block"><Button>Open my dashboard</Button></a>
      </Card>
    );
  }

  const approved = b.decision.state === "approved";
  return (
    <Card className="mx-auto max-w-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Your Bagdrop booking</p>
          <h2 className="font-display text-2xl font-extrabold">{b.name || "Traveller"}</h2>
          <p className="font-mono text-xs text-muted">{b.id}</p>
        </div>
        <Badge tone={b.paid ? "ok" : approved ? "info" : "warn"}>{b.paid ? "paid" : approved ? "approved" : b.decision.state === "rejected" ? "not accepted" : "awaiting approval"}</Badge>
      </div>
      {([
        ["Service", b.service],
        ["Route", `${b.from} → ${b.to}`],
        ["Pickup", `${b.date}${b.slot ? ` · ${b.slot}` : ""}`],
        ["Pieces", `${b.bags} bag(s)${b.oversize ? ` + ${b.oversize} oversize` : ""}`],
      ] as const).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-dashed border-line py-2 text-sm last:border-0"><span className="text-muted">{k}</span><span className="text-right">{v}</span></div>
      ))}
      <p className="my-4 text-center font-display text-4xl font-extrabold">{b.priced ? inr(b.total) : "Rate on request"}</p>

      {b.paid ? (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>Payment verified.</b> {b.identityOk ? "You're all set for pickup." : <>Next: <a className="font-semibold underline" href={`/verify/${b.id}`}>sign the baggage declaration &amp; bond →</a></>}</p>
      ) : b.canPay ? (
        <>
          <UpiPay amount={b.total} reference={b.id} payTo={payTo} />
          <a href={withBase("/account")} className="mt-3 block"><Button className="w-full">Paid? Upload your screenshot in your dashboard →</Button></a>
        </>
      ) : b.pay?.status === "submitted" ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>Payment proof received</b> — finance is verifying it.</p>
      ) : (
        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{b.decision.state === "rejected" ? `This booking wasn't accepted${b.decision.note ? `: ${b.decision.note}` : ""}.` : "Our team is reviewing your booking — payment opens here once it's approved."}</p>
      )}
    </Card>
  );
}
