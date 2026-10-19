/** Admin OS · Partners & API — ported from the static build's m-part
 *  module (admin.html:920-943). 100% reference content in the original —
 *  no partner data, no real API, just a roadmap page. Kept as the same
 *  honest roadmap rather than inventing fake "connected" state. */
import { Badge, Card } from "@/components/ui";

const PARTNERS = [
  { name: "Riya Travel", type: "Travel agency", channel: "WhatsApp + portal" },
  { name: "Skybird", type: "Courier interline", channel: "API (planned)" },
  { name: "ICONIQA", type: "Corporate travel desk", channel: "Email + portal" },
  { name: "Cordelia Cruises", type: "Cruise line", channel: "Manual" },
  { name: "Akasa / IndiGo", type: "Airline interline", channel: "API (planned)" },
];

const ENDPOINTS = [
  { method: "POST", path: "/v1/quotes", note: "Server-signed quote, same engine as the website" },
  { method: "POST", path: "/v1/identity", note: "Submit a verification result" },
  { method: "POST", path: "/v1/payments", note: "Capture against a signed quote" },
  { method: "GET", path: "/v1/shipments/{id}", note: "Status + event log" },
];

export default function PartnersAndApi() {
  return (
    <div className="grid gap-5">
      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Partners</h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-2 pr-2">Partner</th><th className="pr-2">Type</th><th className="pr-2">Channel</th><th className="text-right">MTD</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {PARTNERS.map((p) => (
              <tr key={p.name} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 font-medium">{p.name}</td>
                <td className="pr-2 text-xs text-muted">{p.type}</td>
                <td className="pr-2 text-xs text-muted">{p.channel}</td>
                <td className="text-right text-faint">—</td>
                <td><Badge tone="muted">roadmap</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-faint">Reference list only — no partner bookings/billing data exists yet (same as the original).</p>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">API console</h3>
        <ul className="space-y-1.5 text-xs">
          {ENDPOINTS.map((e) => (
            <li key={e.path} className="flex items-center gap-3 border-b border-dashed border-line py-1.5 last:border-0">
              <span className="w-14 font-mono text-[11px] font-bold text-brand">{e.method}</span>
              <span className="w-44 font-mono text-[11px]">{e.path}</span>
              <span className="text-muted">{e.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-faint">Key rotation every 90 days · sandbox environment · OpenAPI docs — none of this exists yet, same roadmap as the original build.</p>
      </Card>
    </div>
  );
}
