/** Admin OS · Integrations — ported from the static build's m-integ
 *  module (admin.html:1057-1082). 100% status-board content in the
 *  original, no live health checks behind any pill. Kept as the same
 *  honest status board — Supabase is the one row that's actually true. */
import { Badge, Card } from "@/components/ui";

const GROUPS: { title: string; rows: { name: string; note: string; status: "ok" | "muted" | "warn" }[] }[] = [
  {
    title: "Travel data",
    rows: [
      { name: "Flights / AviationStack", note: "Live schedule + delay feed", status: "warn" },
      { name: "Airport AODB", note: "Gate/counter cutoff automation", status: "muted" },
      { name: "Rail / IRCTC", note: "PNR status for rail bookings", status: "muted" },
      { name: "Cruise / Cordelia", note: "Sailing schedule sync", status: "muted" },
      { name: "Airline DCS", note: "Checked-bag tie-in, phase 3", status: "muted" },
    ],
  },
  {
    title: "Commerce",
    rows: [
      { name: "Razorpay", note: "India payment capture", status: "warn" },
      { name: "Stripe", note: "International payment capture", status: "warn" },
      { name: "WhatsApp (Meta Cloud API)", note: "Automated sending", status: "warn" },
      { name: "Zoho Books", note: "Invoice sync", status: "muted" },
      { name: "Google Ads", note: "Conversion tracking", status: "muted" },
      { name: "Claude API (copilot)", note: "Edge Function endpoint, configurable", status: "muted" },
    ],
  },
  {
    title: "Hardware & fleet",
    rows: [
      { name: "GPS / BGTS", note: "Live vehicle tracking", status: "muted" },
      { name: "RFID", note: "Bag-tag scan events", status: "muted" },
      { name: "BAGTAG", note: "Smart luggage tags", status: "muted" },
      { name: "Supabase", note: "Database + realtime + auth — this build", status: "ok" },
    ],
  },
];

const LABEL: Record<string, string> = { ok: "connected", warn: "key needed", muted: "not started" };

export default function Integrations() {
  return (
    <div className="grid gap-5">
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <h3 className="mb-3 font-display text-sm font-bold">{g.title}</h3>
          <ul className="space-y-1.5 text-xs">
            {g.rows.map((r) => (
              <li key={r.name} className="flex items-center justify-between border-b border-dashed border-line py-1.5 last:border-0">
                <span><b>{r.name}</b> <span className="text-muted">· {r.note}</span></span>
                <Badge tone={r.status}>{LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <p className="text-[11px] text-faint">Status board only — these pills are reference notes, not live health checks.</p>
    </div>
  );
}
