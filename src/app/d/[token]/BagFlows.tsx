"use client";
/** Captain bag flows on the driver page — airline check-in at pickup and
 *  baggage-claim at delivery (rules: src/lib/fieldOps.ts).
 *   Pickup:   per bag — scan tag · scan its seal · weight · photo; then the
 *             customer signs; completing marks "Picked up & sealed".
 *   Delivery: scan the Move Pass · scan every tag · send OTP · enter OTP.
 *  Scanner guns type into the focused field (Enter submits); phones use
 *  the camera. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import CameraScanner from "@/components/CameraScanner";

interface BagRow { n: number; plate: string; xl: boolean; seal: string | null; weightKg: number | null; photo: boolean; checkedIn: boolean; claimed: boolean }
interface FlowState {
  pieces: number; xl: number; identityOk: boolean; lrIssued: boolean; picked: boolean; arrived: boolean; delivered: boolean;
  bags: BagRow[]; claim: { passScanned: boolean; otpSentAt: string | null };
}
const HEAVY_KG = 32;

function useFlow(token: string) {
  const [st, setSt] = useState<FlowState | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/track/driver/bags?t=${encodeURIComponent(token)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (j.state) setSt(j.state);
  }, [token]);
  useLoad(load);
  const act = useCallback(async (body: Record<string, unknown> | FormData, okText?: string) => {
    setBusy(true); setMsg(null);
    try {
      const isForm = body instanceof FormData;
      if (isForm) body.set("t", token);
      const r = await fetch("/api/track/driver/bags", isForm ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (j.state) setSt(j.state);
      if (!r.ok || j.error) { setMsg({ ok: false, text: j.detail ?? j.error ?? "Something went wrong — try again." }); return false; }
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } finally { setBusy(false); }
  }, [token]);
  return { st, msg, setMsg, busy, act };
}

function Note({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <p className={`rounded-xl p-3 text-sm ${m.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{m.text}</p>;
}
const box = "w-full rounded-xl border border-line bg-white px-3 py-3 font-mono text-base uppercase tracking-wide focus:border-brand focus:outline-none";

/* ======================= pickup check-in ======================= */
export function PickupCheckIn({ token }: { token: string }) {
  const { st, msg, setMsg, busy, act } = useFlow(token);
  const [tag, setTag] = useState(""); const [seal, setSeal] = useState(""); const [kg, setKg] = useState(""); const [heavyOk, setHeavyOk] = useState(false);
  const [cam, setCam] = useState<"tag" | "seal" | null>(null);
  const sealRef = useRef<HTMLInputElement>(null);
  const onRead = useCallback((v: string) => {
    setCam((which) => { if (which === "tag") { setTag(v); sealRef.current?.focus(); return "seal"; } if (which === "seal") { setSeal(v); return null; } return which; });
  }, []);
  if (!st) return <p className="text-sm text-muted">Loading the bags…</p>;
  const next = st.bags.find((b) => !b.checkedIn || !b.photo);
  const allDone = st.bags.length > 0 && st.bags.length === st.pieces && !next;
  const printUrl = (kind: string, media: string, zpl = false) => `/api/track/driver/bags?t=${encodeURIComponent(token)}&labels=1&kind=${kind}&media=${media}${zpl ? "&format=zpl" : ""}`;

  if (st.picked) return <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">✓ Picked up & sealed — {st.pieces} piece(s) checked in.</p>;
  return (
    <div className="grid gap-3">
      <h2 className="font-display text-lg font-bold">Bag check-in <span className="text-sm font-normal text-muted">{st.bags.filter((b) => b.checkedIn && b.photo).length}/{st.pieces}</span></h2>
      {!st.identityOk && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Aadhaar verification is still pending — you can check the bags in, but pickup completes only after the customer verifies.</p>}
      {!st.lrIssued && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The LR isn&apos;t issued yet — ask the hub before completing the pickup.</p>}

      {st.bags.length < st.pieces && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <p>{st.bags.length ? `${st.pieces - st.bags.length} piece(s) have no tag yet.` : "Tags aren't printed for this booking yet."} Issue them, then print on your portable printer.</p>
          <button disabled={busy} onClick={() => void act({ action: "issue" }, "Tags and seals issued — print them now.")} className="mt-2 cursor-pointer rounded-xl bg-ink px-4 py-2.5 font-bold text-white disabled:opacity-50">Issue tags &amp; seals</button>
        </div>
      )}
      {st.bags.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <a href={printUrl("all", "4x6")} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-2 font-semibold">🖨 Print all (4×6)</a>
          <a href={printUrl("all", "ql62x100")} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-2 font-semibold">🖨 Brother QL-800</a>
          <a href={printUrl("all", "4x6", true)} className="rounded-lg border border-line px-3 py-2 font-semibold">ZPL (Zebra)</a>
        </div>
      )}

      <ul className="grid gap-1.5">
        {st.bags.map((b) => (
          <li key={b.n} className={`flex items-center justify-between rounded-xl border p-2.5 text-sm ${b.checkedIn && b.photo ? "border-green-300 bg-green-50" : next?.n === b.n ? "border-brand" : "border-line"}`}>
            <span><b>{b.n}</b> · <span className="font-mono">{b.plate}</span>{b.xl && <b className="ml-1.5 rounded bg-ink px-1.5 text-[11px] text-white">XL</b>}</span>
            <span className="text-xs text-muted">{b.checkedIn ? `✓ ${b.weightKg} kg${(b.weightKg ?? 0) > HEAVY_KG ? " · HEAVY" : ""}${b.photo ? " · 📷" : " · photo needed"}` : "to check in"}</span>
          </li>
        ))}
      </ul>

      {next && (
        <div className="grid gap-2 rounded-2xl border-2 border-brand/40 p-3">
          <p className="font-semibold">Piece {next.n} of {st.pieces}{next.xl ? " · XL oversize" : ""}</p>
          {!next.checkedIn ? (
            <>
              <label className="text-xs font-semibold text-muted">1 · Scan the bag tag</label>
              <input className={box} value={tag} onChange={(e) => setTag(e.target.value)} placeholder={next.plate} onKeyDown={(e) => { if (e.key === "Enter") sealRef.current?.focus(); }} autoFocus />
              <label className="text-xs font-semibold text-muted">2 · Stick seal {next.seal} over the zip and scan it</label>
              <input ref={sealRef} className={box} value={seal} onChange={(e) => setSeal(e.target.value)} placeholder={next.seal ?? "SL …"} />
              <button onClick={() => setCam(cam ? null : tag ? "seal" : "tag")} className="cursor-pointer text-left text-sm font-semibold text-brand">{cam ? "Stop camera" : `📷 Scan ${tag ? "seal" : "tag"} with camera`}</button>
              {cam && <CameraScanner onRead={onRead} />}
              <label className="text-xs font-semibold text-muted">3 · Weight (kg)</label>
              <input className={`${box} normal-case`} inputMode="decimal" value={kg} onChange={(e) => { setKg(e.target.value); setHeavyOk(false); }} placeholder="18.5" />
              {Number(kg) > HEAVY_KG && (
                <label className="flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-900">
                  <input type="checkbox" checked={heavyOk} onChange={(e) => setHeavyOk(e.target.checked)} /> Over {HEAVY_KG} kg — I&apos;ve put the HEAVY sticker on it
                </label>
              )}
              <button disabled={busy || !tag || !seal || !kg} onClick={async () => { if (await act({ action: "checkin", n: next.n, tag, seal, weightKg: Number(kg), heavyOk }, `Piece ${next.n} checked in — now take its photo.`)) { setTag(""); setSeal(""); setKg(""); setHeavyOk(false); } }}
                className="cursor-pointer rounded-xl bg-brand px-4 py-3 font-bold text-white disabled:opacity-50">Check in piece {next.n}</button>
            </>
          ) : (
            <>
              <label className="text-xs font-semibold text-muted">4 · Photo of piece {next.n} (tag and seal visible)</label>
              <input type="file" accept="image/*" capture="environment" className="text-sm" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const fd = new FormData(); fd.set("n", String(next.n)); fd.set("photo", f);
                await act(fd, `Photo saved for piece ${next.n}.`); e.target.value = "";
              }} />
            </>
          )}
        </div>
      )}

      {allDone && <SignAndComplete busy={busy} onDone={(sig) => act({ action: "complete", signature: sig }, "Picked up & sealed — the customer's Move Pass now lists every tag.")} onError={(t) => setMsg({ ok: false, text: t })} />}
      <Note m={msg} />
    </div>
  );
}

function SignAndComplete({ busy, onDone, onError }: { busy: boolean; onDone: (png: string) => void; onError: (t: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const r = c.getBoundingClientRect(); c.width = r.width * 2; c.height = r.height * 2;
    const g = c.getContext("2d")!; g.scale(2, 2); g.lineWidth = 2.4; g.lineCap = "round"; g.strokeStyle = "#0f172a";
  }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  return (
    <div className="grid gap-2 rounded-2xl border border-line p-3">
      <p className="font-semibold">Customer signature</p>
      <p className="text-xs text-muted">The customer confirms the piece count and condition by signing below.</p>
      <canvas ref={cv} className="h-40 w-full touch-none rounded-xl border border-dashed border-line bg-white"
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); const g = e.currentTarget.getContext("2d")!; g.beginPath(); g.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pos(e); const g = e.currentTarget.getContext("2d")!; g.lineTo(p.x, p.y); g.stroke(); setInked(true); }}
        onPointerUp={() => { drawing.current = false; }} />
      <div className="flex gap-2">
        <button onClick={() => { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setInked(false); }} className="cursor-pointer rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">Clear</button>
        <button disabled={busy} onClick={() => (inked ? onDone(cv.current!.toDataURL("image/png")) : onError("Ask the customer to sign first."))}
          className="flex-1 cursor-pointer rounded-xl bg-green-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">Complete pickup</button>
      </div>
    </div>
  );
}

/* ======================= delivery claim check ======================= */
export function DeliveryClaim({ token }: { token: string }) {
  const { st, msg, busy, act } = useFlow(token);
  const [scan, setScan] = useState(""); const [otp, setOtp] = useState(""); const [cam, setCam] = useState(false);
  const stRef = useRef(st);
  useEffect(() => { stRef.current = st; });
  const submitScan = useCallback(async (v: string) => {
    const s = stRef.current; if (!s || !v.trim()) return;
    const ok = await act(s.claim.passScanned ? { action: "bag", scan: v } : { action: "pass", scan: v }, s.claim.passScanned ? "Bag matched ✓" : "Move Pass matched ✓ — now scan every bag.");
    if (ok) setScan("");
  }, [act]);
  const onCam = useCallback((v: string) => { void submitScan(v); }, [submitScan]);
  if (!st) return <p className="text-sm text-muted">Loading…</p>;
  if (st.delivered) return <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">✓ Delivered — pass, every tag and OTP verified.</p>;
  if (!st.arrived) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The bags haven&apos;t been scanned in at the destination hub yet — the claim check opens after that.</p>;
  const left = st.bags.filter((b) => !b.claimed);
  return (
    <div className="grid gap-3">
      <h2 className="font-display text-lg font-bold">Delivery claim check</h2>
      <ol className="grid gap-1 text-sm">
        <li className={st.claim.passScanned ? "text-green-700" : "font-semibold"}>{st.claim.passScanned ? "✓" : "1"} · Scan the customer&apos;s Move Pass</li>
        <li className={st.claim.passScanned && !left.length ? "text-green-700" : st.claim.passScanned ? "font-semibold" : "text-muted"}>{st.claim.passScanned && !left.length ? "✓" : "2"} · Scan every bag ({st.bags.length - left.length}/{st.bags.length})</li>
        <li className={st.claim.passScanned && !left.length ? "font-semibold" : "text-muted"}>3 · Delivery OTP from the customer</li>
      </ol>
      {(!st.claim.passScanned || left.length > 0) && (
        <>
          <input className={box} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submitScan(scan); }}
            placeholder={st.claim.passScanned ? "Scan or type a bag tag" : "Scan the Move Pass QR"} autoFocus />
          <div className="flex gap-2">
            <button disabled={busy || !scan} onClick={() => void submitScan(scan)} className="flex-1 cursor-pointer rounded-xl bg-ink px-4 py-2.5 font-bold text-white disabled:opacity-50">Match</button>
            <button onClick={() => setCam((v) => !v)} className="cursor-pointer rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">{cam ? "Stop camera" : "📷 Camera"}</button>
          </div>
          {cam && <CameraScanner onRead={onCam} />}
        </>
      )}
      {st.claim.passScanned && (
        <ul className="grid gap-1">
          {st.bags.map((b) => (
            <li key={b.n} className={`flex justify-between rounded-lg border px-2.5 py-1.5 text-sm ${b.claimed ? "border-green-300 bg-green-50" : "border-line"}`}>
              <span><b>{b.n}</b> · <span className="font-mono">{b.plate}</span>{b.xl && <b className="ml-1.5 rounded bg-ink px-1.5 text-[11px] text-white">XL</b>}</span><span>{b.claimed ? "✓" : "—"}</span>
            </li>
          ))}
        </ul>
      )}
      {st.claim.passScanned && !left.length && (
        <div className="grid gap-2 rounded-2xl border-2 border-green-300 p-3">
          <button disabled={busy} onClick={() => void act({ action: "otp" }, "OTP sent to the customer's phone.")} className="cursor-pointer rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">{st.claim.otpSentAt ? "Resend OTP" : "Send delivery OTP to customer"}</button>
          <input className={box} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit OTP" />
          <button disabled={busy || otp.length !== 6} onClick={() => void act({ action: "deliver", otp }, "Delivered ✓")} className="cursor-pointer rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50">Complete delivery</button>
        </div>
      )}
      <Note m={msg} />
    </div>
  );
}
