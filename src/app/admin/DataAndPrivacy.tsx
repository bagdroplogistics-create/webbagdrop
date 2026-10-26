/** Admin OS · Data & privacy — ported from the static build's m-data
 *  module (admin.html:1116-1126). 100% policy content in the original —
 *  no consent ledger, purge job, or subject-request workflow actually
 *  exists in code. Kept as the same honest policy reference rather than
 *  implying any of this runs automatically. */
const CARDS = [
  { title: "Consent ledger (DPDPA)", body: "Every identity check and opt-in should be stored with purpose, timestamp, and channel. Not yet implemented — no consent records are currently written anywhere.", stripe: "ok" },
  { title: "Retention & purge", body: "Identity data 180 days · photos 365 days · financial records 8 years. No automatic purge job exists yet; retention is a policy, not an enforced schedule.", stripe: "info" },
  { title: "Residency & backups", body: "Supabase project in Mumbai (ap-south-1). Point-in-time recovery 7 days, daily snapshots retained 35 days — infrastructure configuration, not application logic.", stripe: "warn" },
  { title: "Breach runbook", body: "Detect → contain → assess → notify within 72 hours. A checklist for the team to follow; no automated detection or notification exists.", stripe: undefined },
  { title: "Data products", body: "Warehouse tables for lane economics and demand forecasting. Aspirational — no data warehouse exists yet.", stripe: undefined },
  { title: "Subject requests", body: "Access, correction, and erasure requests with a 30-day response clock. No intake form or workflow exists yet — requests would need to be handled manually today.", stripe: undefined },
] as const;

export default function DataAndPrivacy() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CARDS.map((c) => (
        <div key={c.title} className={`a-card${c.stripe ? ` a-stripe a-stripe-${c.stripe}` : ""}`}>
          <h3 className="mb-1.5 text-sm font-bold" style={{ fontFamily: "var(--a-display)" }}>{c.title}</h3>
          <p className="text-xs" style={{ color: "var(--a-muted)" }}>{c.body}</p>
        </div>
      ))}
    </div>
  );
}
