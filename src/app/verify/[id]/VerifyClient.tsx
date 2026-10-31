"use client";
/** /verify/<id> — the pre-pickup indemnity bond (steps 6–7). Opens once the
 *  payment is verified. Domestic guests tick the declarations and sign with
 *  their Aadhaar OTP; international guests upload passport + visa, wait for
 *  the team's review, then sign with an OTP to their booking contact. All
 *  checks happen on the server (/api/kyc) — this page only collects input. */
import { useCallback, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { DECLARATIONS, INDEMNITY_VERSION, PROHIBITED, REQUIRED_IDS, UNDERTAKINGS } from "@/lib/indemnity";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

interface V {
  id: string; from: string; to: string; date: string; slot: string; bags: number; oversize: number;
  name: string; mobile: string; email: string;
  settled: boolean; verified: boolean; signed: boolean; signedAt: string | null; method: string | null;
  locked: boolean; attemptsLeft: number;
  kyc: { kind: "domestic" | "international"; status: string; note: string | null; submissions: number } | null;
}

const ERR: Record<string, string> = {
  WRONG_OTP: "That code didn't match — check it and try again.",
  LOCKED: "Verification is locked after 3 wrong codes. Our team has been alerted and will call you.",
  BAD_AADHAAR: "That isn't a valid 12-digit Aadhaar number.",
  BOXES_REQUIRED: "Please tick every declaration to sign the bond.",
  PAYMENT_NOT_VERIFIED: "This opens once your payment is verified.",
};

export default function VerifyClient({ id }: { id: string }) {
  const bid = decodeURIComponent(id).toUpperCase();
  const [b, setB] = useState<V | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"domestic" | "international">("domestic");
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [fragile, setFragile] = useState("");
  const [signature, setSignature] = useState("");
  const [place, setPlace] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState<{ demo?: string; exp?: number; token?: string; channel?: string } | null>(null);
  const [intl, setIntl] = useState({ nationality: "", passportNo: "", indiaAddress: "" });
  const [files, setFiles] = useState<{ passport?: File; visa?: File }>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/kyc?id=${encodeURIComponent(bid)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.error) setLoadErr(j.error === "NOT_FOUND" ? "Booking not found — check the link." : j.error);
      else { setB(j.booking as V); if (j.booking.kyc?.kind) setKind(j.booking.kyc.kind); }
    } catch { setLoadErr("Could not reach the server — try again."); }
  }, [bid]);
  useLoad(load);

  const allTicked = REQUIRED_IDS.every((k) => ticks[k]);
  const tick = (k: string) => setTicks((t) => ({ ...t, [k]: !t[k] }));

  async function post(body: unknown) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/kyc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(ERR[j.error] ?? j.detail ?? j.error ?? "Something went wrong."); if (j.error === "LOCKED") void load(); return null; }
      return j;
    } catch { setErr("Could not reach the server — try again."); return null; }
    finally { setBusy(false); }
  }
  const accepted = () => Object.keys(ticks).filter((k) => ticks[k]);

  async function sendAadhaarOtp() {
    const j = await post({ id: bid, action: "aadhaar_otp", aadhaar });
    if (j) setOtpSent({ demo: j.demo });
  }
  async function signDomestic() {
    const j = await post({ id: bid, action: "sign_domestic", aadhaar, otp, signature, place, fragile, accepted: accepted() });
    if (j?.booking) setB(j.booking);
  }
  async function sendIntlOtp() {
    const j = await post({ id: bid, action: "intl_otp" });
    if (j) setOtpSent({ demo: j.demo, exp: j.exp, token: j.token, channel: j.channel });
  }
  async function signIntl() {
    const j = await post({ id: bid, action: "sign_international", otp: { code: otp, exp: otpSent?.exp, token: otpSent?.token }, signature, place, fragile, accepted: accepted() });
    if (j?.booking) setB(j.booking);
  }
  async function uploadDocs() {
    setBusy(true); setErr(null);
    try {
      const f = new FormData();
      f.set("id", bid); f.set("nationality", intl.nationality); f.set("passportNo", intl.passportNo); f.set("indiaAddress", intl.indiaAddress);
      if (files.passport) f.set("passport", files.passport);
      if (files.visa) f.set("visa", files.visa);
      const r = await fetch("/api/kyc", { method: "POST", body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.detail ?? j.error ?? "Upload failed.");
      else setB(j.booking);
    } catch { setErr("Could not reach the server — try again."); }
    finally { setBusy(false); }
  }

  const bond = (
    <div className="mt-5 grid gap-4">
      <section>
        <h3 className="font-display text-base font-bold">A · Declaration of contents</h3>
        {DECLARATIONS.filter((d) => !d.optional).map((d) => <Check key={d.id} on={!!ticks[d.id]} toggle={() => tick(d.id)} text={d.text} />)}
        <Field label="Fragile items, and electronics or watches over ₹25,000 (item and approx. value — optional)">
          <Input value={fragile} maxLength={300} onChange={(e) => setFragile(e.target.value)} placeholder="e.g. glass vase ₹4,000; MacBook ₹1,20,000" />
        </Field>
      </section>

      <section>
        <h3 className="font-display text-base font-bold">B · My bags do NOT contain</h3>
        <div className="grid gap-2.5">
          {PROHIBITED.map((g) => (
            <div key={g.id} className={g.highlight ? "rounded-xl border-2 border-red-600 bg-red-50 p-3" : "rounded-xl border border-line bg-white p-3"}>
              {g.highlight && <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-red-700">⚠ Liquor policy — zero tolerance</p>}
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#EA580C]" checked={!!ticks[g.id]} onChange={() => tick(g.id)} />
                <span>
                  <b className={g.highlight ? "text-red-900" : ""}>{g.title}</b>
                  <ul className={`mt-1 list-disc space-y-0.5 pl-4 text-[13px] ${g.highlight ? "text-red-900" : "text-muted"}`}>
                    {g.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                  {g.law && <span className="mt-1 block text-[11px] text-faint">{g.law}</span>}
                </span>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-display text-base font-bold">C · Indemnity</h3>
        {UNDERTAKINGS.map((u) => <Check key={u.id} on={!!ticks[u.id]} toggle={() => tick(u.id)} text={u.text} />)}
      </section>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Your full name (signature)"><Input value={signature} maxLength={80} onChange={(e) => setSignature(e.target.value)} placeholder={b?.name} /></Field>
        <Field label="Place"><Input value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} placeholder="Vadodara" /></Field>
      </div>
      <p className="text-[11px] text-faint">Bond version {INDEMNITY_VERSION}. The exact text you agree to is recorded with your signature.</p>
    </div>
  );

  return (
    <main className="mx-auto min-h-[70vh] max-w-2xl px-4 py-12">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[.14em] text-brand">Before pickup</p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Baggage declaration &amp; indemnity bond</h1>
      <p className="mt-2 mb-6 text-sm text-muted">Required once, before your bags move — under BCAS, DGCA, CISF, RPF, Railways Act and road-transport rules. Takes about two minutes. Bagdrop keeps only the last four characters of your ID.</p>

      {loadErr && !b && <Card><p className="text-sm text-red-700">{loadErr}</p></Card>}
      {!b && !loadErr && <Card><p className="text-sm text-muted">Loading your booking…</p></Card>}

      {b && (
        <Card className="anim-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <b className="font-mono text-sm">{b.id}</b>
              <p className="text-sm">{b.from} → {b.to} · {b.bags + b.oversize} piece{b.bags + b.oversize === 1 ? "" : "s"}</p>
              <p className="text-xs text-muted">{b.name} · {b.mobile} · pickup {b.slot || "TBC"} on {b.date}</p>
            </div>
            <Badge tone={b.verified ? "ok" : b.locked ? "bad" : b.settled ? "warn" : "info"}>{b.verified ? "Signed & verified" : b.locked ? "Locked" : b.settled ? "Sign now" : "Payment pending"}</Badge>
          </div>

          {b.verified ? (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900">
              <b>Bond signed and identity verified</b>{b.signedAt ? ` on ${new Date(b.signedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. You&apos;re all set — the captain seals your bags with you at pickup.
            </p>
          ) : !b.settled ? (
            <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">This step opens once your payment is verified by our finance team. You&apos;ll get a message with this link.</p>
          ) : b.locked ? (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Verification locked</b> after 3 wrong codes. Our team has been alerted and will call you, or message us on <a className="font-semibold underline" href="https://wa.me/916357115711">WhatsApp</a>.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["domestic", "international"] as const).map((k) => (
                  <button key={k} disabled={!!b.kyc && b.kyc.kind === "international" && k === "domestic" && b.kyc.status !== "docs_rejected"}
                    onClick={() => { setKind(k); setOtpSent(null); setOtp(""); setErr(null); }}
                    className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${kind === k ? "bg-ink text-white" : "bg-paper text-muted"}`}>
                    {k === "domestic" ? "Indian resident · Aadhaar" : "International guest · passport"}
                  </button>
                ))}
              </div>

              {kind === "domestic" && (
                <>
                  {bond}
                  <div className="mt-4 rounded-xl bg-paper p-3">
                    <p className="mb-2 text-sm font-semibold">Sign with Aadhaar OTP</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Aadhaar number"><Input className="w-52 font-mono" inputMode="numeric" maxLength={14} value={aadhaar} onChange={(e) => { setAadhaar(e.target.value.replace(/[^\d ]/g, "")); setOtpSent(null); }} placeholder="XXXX XXXX XXXX" /></Field>
                      <Button variant="outline" disabled={busy || aadhaar.replace(/\D/g, "").length !== 12} onClick={() => void sendAadhaarOtp()}>{otpSent ? "Resend OTP" : "Send OTP"}</Button>
                    </div>
                    {otpSent && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <Field label={`OTP sent to your Aadhaar-linked mobile${otpSent.demo ? ` (demo: ${otpSent.demo})` : ""}`}>
                          <Input className="w-40 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
                        </Field>
                        <Button disabled={busy || otp.length !== 6 || !allTicked || signature.trim().length < 3} onClick={() => void signDomestic()}>{busy ? "Signing…" : "Sign the bond"}</Button>
                      </div>
                    )}
                    {!allTicked && <p className="mt-2 text-xs text-muted">Tick every declaration above to sign. {b.attemptsLeft < 3 ? `${b.attemptsLeft} attempt(s) left.` : ""}</p>}
                    <p className="mt-2 text-[11px] text-faint">Your Aadhaar number is checked and discarded — only the last four digits are stored.</p>
                  </div>
                </>
              )}

              {kind === "international" && (
                !b.kyc || b.kyc.kind !== "international" || b.kyc.status === "docs_rejected" ? (
                  <div className="mt-4 grid gap-1">
                    {b.kyc?.status === "docs_rejected" && <p className="mb-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>Please re-upload:</b> {b.kyc.note ?? "our team couldn't verify the documents."}</p>}
                    <p className="text-sm text-muted">Upload your documents. Our team checks them by hand (usually within a few hours), then you sign the bond here.</p>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      <Field label="Nationality"><Input value={intl.nationality} maxLength={40} onChange={(e) => setIntl({ ...intl, nationality: e.target.value })} /></Field>
                      <Field label="Passport number"><Input className="font-mono" value={intl.passportNo} maxLength={20} onChange={(e) => setIntl({ ...intl, passportNo: e.target.value.toUpperCase() })} /></Field>
                    </div>
                    <Field label="Address in India (hotel or host)"><Input value={intl.indiaAddress} maxLength={200} onChange={(e) => setIntl({ ...intl, indiaAddress: e.target.value })} /></Field>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      <Field label="Passport photo page (image or PDF, ≤5 MB)"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="text-xs" onChange={(e) => setFiles({ ...files, passport: e.target.files?.[0] })} /></Field>
                      <Field label="Visa / e-visa / OCI card"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="text-xs" onChange={(e) => setFiles({ ...files, visa: e.target.files?.[0] })} /></Field>
                    </div>
                    <Button disabled={busy || !files.passport || !files.visa || !intl.nationality || intl.passportNo.length < 6 || intl.indiaAddress.length < 8} onClick={() => void uploadDocs()}>{busy ? "Uploading…" : "Submit documents"}</Button>
                  </div>
                ) : b.kyc.status === "docs_submitted" ? (
                  <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><b>Documents received.</b> Our team is reviewing them — you&apos;ll get a message to sign the bond as soon as they&apos;re approved.</p>
                ) : (
                  <>
                    <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900"><b>Documents approved.</b> Tick the declarations and sign with the code we send to your booking {b.email ? `email (${b.email})` : `mobile (${b.mobile})`}.</p>
                    {bond}
                    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-paper p-3">
                      <Button variant="outline" disabled={busy} onClick={() => void sendIntlOtp()}>{otpSent ? "Resend code" : "Send signing code"}</Button>
                      {otpSent && (
                        <>
                          <Field label={`Code${otpSent.demo ? ` (demo: ${otpSent.demo})` : ""}`}><Input className="w-40 font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} /></Field>
                          <Button disabled={busy || otp.length !== 6 || !allTicked || signature.trim().length < 3} onClick={() => void signIntl()}>{busy ? "Signing…" : "Sign the bond"}</Button>
                        </>
                      )}
                    </div>
                  </>
                )
              )}
              {err && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-sm text-red-800">{err}</p>}
            </>
          )}
        </Card>
      )}
    </main>
  );
}

function Check({ on, toggle, text }: { on: boolean; toggle: () => void; text: string }) {
  return (
    <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[13.5px]">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#EA580C]" checked={on} onChange={toggle} />
      <span>{text}</span>
    </label>
  );
}
