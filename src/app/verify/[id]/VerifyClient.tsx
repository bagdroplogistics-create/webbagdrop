"use client";
/** Post-payment Aadhaar verification page — the link sent automatically after
 *  every captured payment (template `verify_identity`). Pickup is blocked
 *  server-side until this completes, so this page is the unlock. Works with
 *  the Supabase backend via /api/verify, and in local-demo mode directly. */
import { useCallback, useEffect, useState } from "react";
import { backend, getBooking, updateBooking, nowIso } from "@/lib/db";
import { Badge, Button, Card, Input } from "@/components/ui";

interface V {
  id: string; status: string; from: string; to: string; date: string; slot: string;
  bags: number; oversize: number; name: string; mobile: string;
  paid: boolean; ror: boolean; verified: boolean; verifiedAt: string | null;
}

export default function VerifyClient({ id }: { id: string }) {
  const bid = decodeURIComponent(id).toUpperCase();
  const [b, setB] = useState<V | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (backend === "local") {
        const d = await getBooking(bid);
        if (!d) { setErr("Booking not found — check the link."); return; }
        setB({
          id: d.id, status: d.status, from: d.from, to: d.to, date: d.date, slot: d.slot,
          bags: d.bags, oversize: d.oversize, name: d.traveller.name,
          mobile: d.traveller.mobile.replace(/.(?=.{3})/g, "•"),
          paid: d.pay?.status === "captured", ror: !!d.quote.breakdown.ror,
          verified: !!d.identity?.ok, verifiedAt: d.identity?.ok ? d.identity.at : null,
        });
        return;
      }
      const r = await fetch(`/api/verify?id=${encodeURIComponent(bid)}`);
      const j = await r.json();
      if (j.error) setErr(j.error === "NOT_FOUND" ? "Booking not found — check the link." : j.error);
      else setB(j.booking as V);
    } catch { setErr("Could not reach the server — try again."); }
  }, [bid]);
  useEffect(() => { void load(); }, [load]);

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      if (backend === "local") {
        if (otp.trim() !== "112233") { setErr("That OTP didn't match — try again."); return; }
        await updateBooking(bid, { identity: { ok: true, at: nowIso(), method: "UIDAI Aadhaar OTP · DigiLocker (demo)", score: 0.97 } },
          "Identity verified · UIDAI Aadhaar OTP (post-payment, pre-pickup)");
        await load();
        return;
      }
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bid, otp }) });
      const j = await r.json();
      if (j.error) setErr(j.error === "WRONG_OTP" ? "That OTP didn't match — check the code UIDAI sent and try again." : j.error);
      else setB(j.booking as V);
    } catch { setErr("Could not reach the server — try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto min-h-[70vh] max-w-xl px-4 py-12">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[.14em] text-brand">Identity verification</p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Verify your identity to complete your booking</h1>
      <p className="mt-2 mb-6 text-sm text-muted">UIDAI sends a one-time password to the mobile number linked to your Aadhaar. We retain only a verified name and a reference — never your Aadhaar number. Required once, before pickup.</p>

      {err && !b && <Card><p className="text-sm text-red-700">{err}</p></Card>}
      {!b && !err && <Card><p className="text-sm text-muted">Loading your booking…</p></Card>}

      {b && (
        <Card className="anim-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <b className="font-mono text-sm">{b.id}</b>
              <p className="text-sm">{b.from} → {b.to} · {b.bags + b.oversize} piece{b.bags + b.oversize === 1 ? "" : "s"}</p>
              <p className="text-xs text-muted">{b.name} · {b.mobile} · pickup {b.slot || "TBC"} on {b.date}</p>
            </div>
            <Badge tone={b.verified ? "ok" : b.paid ? "warn" : "info"}>{b.verified ? "Verified" : b.paid ? "Paid · verify now" : b.ror ? "Rate on request" : "Unpaid"}</Badge>
          </div>

          {b.verified ? (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900">
              <b>Identity verified</b>{b.verifiedAt ? ` on ${new Date(b.verifiedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""} · you&apos;re all set. The captain seals your bags with you at pickup.
            </p>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-sm">Enter the UIDAI OTP sent to your Aadhaar-linked mobile <span className="font-mono text-xs text-muted">(demo: 112233)</span></p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Input className="w-40 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="••••••" />
                <Button disabled={busy || otp.trim().length !== 6} onClick={() => void confirm()}>{busy ? "Checking…" : "Verify identity"}</Button>
              </div>
              {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
              <p className="mt-3 text-xs text-muted">Your payment is received. This verification completes the chain of custody — pickup is released the moment it is done.</p>
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
