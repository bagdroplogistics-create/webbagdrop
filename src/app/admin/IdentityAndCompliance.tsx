"use client";
/** BAGDROP OS · Identity & compliance — the pre-pickup bond desk (step 7).
 *  Every paid booking must have a signed indemnity bond before pickup (the
 *  server refuses picked_up without it). This desk shows what is stuck and
 *  why: unsigned bonds, international documents to review, Aadhaar lock-
 *  outs and pickups at risk, with the actions to clear each one. */
import { useEffect, useMemo, useState } from "react";
import { refreshBookings, watchAdminBookings } from "@/lib/adminApi";
import { isPaid } from "@/lib/payState";
import { istToday, istTomorrow } from "@/lib/services";
import { INDEMNITY_VERSION } from "@/lib/indemnity";
import type { Booking } from "@/lib/types";
import { Badge, Button, Card, Input } from "@/components/ui";

const PROVIDERS = [
  { name: "Aadhaar eSign (ESP)", note: "eMudhra / Protean / CDAC — legally valid OTP signature", status: "demo mode" },
  { name: "DigiLocker", note: "Aadhaar XML pull · ₹8/check", status: "to wire" },
  { name: "HyperVerge", note: "Passport / face match for international guests", status: "manual review today" },
];

type Issue = { b: Booking; kind: "locked" | "docs" | "rejected" | "unsigned"; risk: boolean; label: string };
const closed = (b: Booking) => ["delivered", "cancelled", "rejected", "picked_up", "in_transit"].includes(b.status);

export default function IdentityAndCompliance() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [days] = useState(() => ({ today: istToday(), tomorrow: istTomorrow() }));
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);

  const issues = useMemo(() => {
    const out: Issue[] = [];
    for (const b of bookings) {
      if (closed(b) || b.identity?.ok || !(isPaid(b) || b.payer)) continue;
      const risk = !!b.date && b.date <= days.tomorrow;
      const locked = (b.admin as { aadhaarLocked?: boolean }).aadhaarLocked;
      if (locked) out.push({ b, kind: "locked", risk, label: "Aadhaar OTP locked after 3 wrong codes" });
      else if (b.kyc?.status === "docs_submitted") out.push({ b, kind: "docs", risk, label: `International documents to review (${b.kyc.nationality ?? "—"})` });
      else if (b.kyc?.status === "docs_rejected") out.push({ b, kind: "rejected", risk, label: `Documents rejected — waiting for re-upload · ${b.kyc.note ?? ""}` });
      else out.push({ b, kind: "unsigned", risk, label: b.kyc?.status === "docs_approved" ? "Documents approved — guest yet to sign" : "Bond not signed yet" });
    }
    const rank = { locked: 0, docs: 1, rejected: 2, unsigned: 3 };
    return out.sort((x, y) => Number(y.risk) - Number(x.risk) || rank[x.kind] - rank[y.kind] || (x.b.date ?? "").localeCompare(y.b.date ?? ""));
  }, [bookings, days]);

  const signed = useMemo(() => bookings.filter((b) => b.indemnity?.textHash).sort((a, b) => b.indemnity!.acceptedAt.localeCompare(a.indemnity!.acceptedAt)), [bookings]);

  async function act(b: Booking, action: string, extra: Record<string, string> = {}) {
    setBusy(`${b.id}:${action}`); setMsg(null);
    try {
      const r = await fetch("/api/admin/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, action, note: note[b.id], ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
      if (action === "docUrl") window.open(j.url, "_blank", "noopener,noreferrer");
      else { refreshBookings(); }
      if (action !== "docUrl") setMsg(`${b.id}: ${action === "approveDocs" ? "documents approved — guest asked to sign" : action === "rejectDocs" ? "documents rejected — guest asked to re-upload" : action === "unlock" ? "unlocked — client told to retry" : "reminder sent"}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }

  const kpi = (label: string, value: number, tone?: "bad" | "warn") => (
    <Card><span className="block text-[11px] text-muted">{label}</span><span className={`block font-display text-xl font-extrabold ${tone === "bad" && value ? "text-red-700" : tone === "warn" && value ? "text-amber-700" : ""}`}>{value}</span></Card>
  );

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpi("Pickup at risk (≤ tomorrow)", issues.filter((i) => i.risk).length, "bad")}
        {kpi("Aadhaar locked", issues.filter((i) => i.kind === "locked").length, "bad")}
        {kpi("Documents to review", issues.filter((i) => i.kind === "docs").length, "warn")}
        {kpi("Awaiting signature", issues.filter((i) => i.kind === "unsigned" || i.kind === "rejected").length, "warn")}
        {kpi("Bonds signed", signed.length)}
      </div>

      <Card>
        <h3 className="mb-1 font-display text-sm font-bold">Issues before pickup</h3>
        <p className="mb-3 text-xs text-muted">Paid bookings without a signed bond. Pickup is locked by the server until each is cleared. Clients get automatic reminders the day before pickup.</p>
        {msg && <p className="mb-3 rounded-xl bg-paper p-2.5 text-xs">{msg}</p>}
        {issues.length === 0 && <p className="py-4 text-center text-sm text-muted">No open issues — every paid booking has a signed bond.</p>}
        <div className="grid gap-2">
          {issues.map(({ b, kind, risk, label }) => (
            <div key={b.id} className={`rounded-xl border p-3 text-xs ${risk || kind === "locked" ? "border-red-300 bg-red-50/60" : kind === "docs" ? "border-amber-300 bg-amber-50/60" : "border-line bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b className="font-mono text-[11px]">{b.id}</b> · {b.traveller.name} · {b.traveller.mobile} · {b.from} → {b.to}</span>
                <span className="flex gap-1">{risk && <Badge tone="bad">pickup {b.date === days.today ? "today" : "tomorrow"}</Badge>}<Badge tone={kind === "locked" ? "bad" : kind === "docs" ? "warn" : "muted"}>{kind}</Badge></span>
              </div>
              <p className="mt-1 text-muted">{label} · pickup {b.date || "TBC"}</p>
              {kind === "docs" && (
                <div className="mt-1.5 flex flex-wrap gap-2 text-muted">
                  passport {b.kyc?.passportNo} · stays at {b.kyc?.indiaAddress}
                  {(b.kyc?.docs ?? []).slice(-2).map((d) => (
                    <button key={d.path} className="cursor-pointer font-semibold text-ink underline" disabled={!!busy} onClick={() => void act(b, "docUrl", { path: d.path })}>view {d.kind}</button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {kind === "docs" && (
                  <>
                    <Input className="w-56" placeholder="Note (reason if rejecting)" value={note[b.id] ?? ""} onChange={(e) => setNote((p) => ({ ...p, [b.id]: e.target.value }))} />
                    <Button size="sm" disabled={!!busy} onClick={() => void act(b, "approveDocs")}>Approve documents</Button>
                    <Button size="sm" variant="outline" disabled={!!busy || !(note[b.id] ?? "").trim()} onClick={() => void act(b, "rejectDocs")}>Reject</Button>
                  </>
                )}
                {kind === "locked" && <Button size="sm" disabled={!!busy} onClick={() => void act(b, "unlock")}>Unlock after call</Button>}
                {(kind === "unsigned" || kind === "rejected" || kind === "locked") && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void act(b, "remind")}>Send reminder</Button>}
                <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(`${location.origin}/verify/${b.id}`)}>Copy signing link</Button>
                <a className="font-semibold underline" href={`https://wa.me/${b.traveller.mobile.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp client</a>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Signed bonds <span className="font-normal text-faint">current version {INDEMNITY_VERSION}</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-2">Booking</th><th className="pr-2">Signed by</th><th className="pr-2">ID</th><th className="pr-2">Method</th><th className="pr-2">Declared</th><th>Signed</th>
              </tr>
            </thead>
            <tbody>
              {signed.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">No bonds signed yet.</td></tr>}
              {signed.slice(0, 50).map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                  <td className="pr-2">{b.indemnity!.signature}{b.indemnity!.place ? <span className="text-xs text-muted"> · {b.indemnity!.place}</span> : null}</td>
                  <td className="pr-2 font-mono text-xs">{b.indemnity!.idType} {b.indemnity!.idNumber}</td>
                  <td className="pr-2 text-xs text-muted">{b.indemnity!.method === "aadhaar_otp" ? "Aadhaar OTP" : "Documents + OTP"}{b.indemnity!.version !== INDEMNITY_VERSION ? ` · v${b.indemnity!.version}` : ""}</td>
                  <td className="pr-2 text-xs text-muted">{b.indemnity!.fragile ?? "—"}</td>
                  <td className="text-xs">{new Date(b.indemnity!.acceptedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Providers & registrations</h3>
        <ul className="space-y-1.5 text-xs">
          {PROVIDERS.map((p) => (
            <li key={p.name} className="flex items-center justify-between border-b border-dashed border-line py-1.5 last:border-0">
              <span><b>{p.name}</b> <span className="text-muted">· {p.note}</span></span>
              <Badge tone="muted">{p.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
