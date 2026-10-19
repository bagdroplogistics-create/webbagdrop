"use client";
/** Admin OS · Rules & notifications — ported from the static build's
 *  m-rules module (admin.html:1035-1055, admin.js:1804-1844). The rule
 *  catalog (which event, which audience/channel) is the same fixed list
 *  the original shipped as seed data. Toggle state is REAL — it persists
 *  to settings/rules, same as the original — but as in the original,
 *  nothing downstream actually reads this to change send behavior yet;
 *  it's a real switch over a currently-decorative effect. */
import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";

const RULES: { key: string; event: string; audience: string; langs: string; def: boolean }[] = [
  { key: "quote.ready", event: "Quote ready", audience: "Customer · WhatsApp, SMS, email · pay or hold", langs: "EN HI GU", def: true },
  { key: "quote.expiring", event: "Quote lock expiring (2h left)", audience: "Customer · WhatsApp reminder", langs: "EN HI", def: true },
  { key: "booking.submitted", event: "Booking submitted", audience: "Ops inbox · new-booking alert", langs: "internal", def: true },
  { key: "booking.accepted", event: "Booking accepted", audience: "Customer · confirmation + captain ETA", langs: "EN HI GU", def: true },
  { key: "booking.revised", event: "Price revised", audience: "Customer · approve/decline link", langs: "EN HI", def: true },
  { key: "captain.assigned", event: "Captain assigned", audience: "Customer + captain · contact exchange", langs: "EN HI", def: true },
  { key: "pickup.reminder", event: "Pickup window in 1h", audience: "Customer · reminder", langs: "EN HI GU", def: true },
  { key: "pickup.done", event: "Picked up", audience: "Customer · sealed-bag photo + tracking link", langs: "EN HI", def: true },
  { key: "transit.update", event: "In transit, major hub", audience: "Customer · status ping", langs: "EN", def: false },
  { key: "delivery.done", event: "Delivered", audience: "Customer · POD + receipt", langs: "EN HI GU", def: true },
  { key: "flight.delay>60", event: "Flight delay > 60 min", audience: "Re-plan · ops gate · then everyone told", langs: "ops gate", def: true },
  { key: "payment.received", event: "Payment captured", audience: "Customer · receipt", langs: "EN HI", def: true },
  { key: "payment.failed", event: "Payment failed", audience: "Customer · retry link", langs: "EN", def: true },
  { key: "identity.review", event: "Identity in review band", audience: "Ops inbox · manual check needed", langs: "internal", def: true },
  { key: "exception.raised", event: "Exception raised", audience: "Ops inbox · escalation", langs: "internal", def: true },
  { key: "wedding.inquiry", event: "Wedding inquiry received", audience: "Events desk · follow-up nudge", langs: "internal", def: true },
  { key: "shipment.closed+90d", event: "Shipment closed, 90 days on", audience: "Customer · return-season nudge", langs: "draft", def: false },
];

export default function RulesAndNotifications() {
  const [state, setState] = useState<Record<string, boolean> | null>(null);
  const [err, setErr] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/rules").then((r) => r.json()).then((j) => {
      if (j.error) { setErr(j.error); return; }
      const merged: Record<string, boolean> = {};
      RULES.forEach((r) => { merged[r.key] = j.state[r.key] ?? r.def; });
      setState(merged);
    });
  }, []);

  async function toggle(key: string) {
    if (!state) return;
    const next = { ...state, [key]: !state[key] };
    setState(next);
    setSavingKey(key);
    try {
      const r = await fetch("/api/admin/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: next }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setSavingKey(null);
  }

  if (!state) return <p className="text-sm text-muted">{err || "Loading rules…"}</p>;

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Notification rules <Badge tone="ok">saved to settings</Badge></h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-2 pr-2">Event</th><th className="pr-2">Audience / channel</th><th className="pr-2">Languages</th><th>On</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 font-medium">{r.event}</td>
                <td className="pr-2 text-xs text-muted">{r.audience}</td>
                <td className="pr-2 font-mono text-[11px] text-faint">{r.langs}</td>
                <td>
                  <button
                    onClick={() => void toggle(r.key)}
                    disabled={savingKey === r.key}
                    className={`h-6 w-11 cursor-pointer rounded-full transition-colors ${state[r.key] ? "bg-brand" : "bg-line"}`}
                  >
                    <span className={`block size-4.5 rounded-full bg-white shadow transition-transform ${state[r.key] ? "translate-x-5.5" : "translate-x-0.5"}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-faint">On/off state saves for real. No dispatcher reads it yet to actually change sending — same as the original build.</p>
      </Card>
    </div>
  );
}
