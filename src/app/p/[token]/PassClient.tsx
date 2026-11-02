"use client";
/** The Move Pass — an airline boarding pass for the customer's bags.
 *  Main panel (route, passenger, pickup, pieces, addresses, captains, every
 *  tag with XL marked, PDF417) and a perforated claim stub (QR) that the
 *  delivery captain scans. "Download PDF" prints an A4 pass (save as PDF);
 *  wallet buttons appear once Apple / Google Wallet keys are configured.
 *  Refreshes every minute so the status and tag list stay current. */
import { useCallback, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useLoad } from "@/lib/useLoad";
import { COMPANY } from "@/lib/company";
import { pcsLabel } from "@/lib/opsModel";
import type { PassView } from "@/lib/movePass";

interface PassResp { pass: PassView; passUrl: string; qrSvg: string; pdf417Svg: string; trackUrl: string | null; wallet: { apple: boolean; google: boolean } }
type State = { kind: "loading" } | { kind: "bad" } | { kind: "ok"; r: PassResp };
const MODE_ICON: Record<string, string> = { road: "🚚", air: "✈️", rail: "🚆", sea: "⛴" };
const day = (d: string | null, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", o) : "—";
const WA = `https://wa.me/${COMPANY.phone.replace(/\D/g, "")}`;

export default function PassClient({ token }: { token: string }) {
  const [st, setSt] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pass?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (r.status === 404) { setSt({ kind: "bad" }); return; }
      const j = await r.json();
      if (j.pass) setSt({ kind: "ok", r: j });
    } catch { /* keep what is on screen; the next refresh retries */ }
  }, [token]);
  useLoad(load, 60_000);

  return (
    <main className="min-h-screen bg-paper print:bg-white">
      <style>{`@media print{@page{size:A4;margin:12mm}.pass-card{box-shadow:none!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-display text-lg font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span></Link>
          <span className="text-xs text-muted">Move Pass</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 print:p-0">
        {st.kind === "loading" && <p className="text-sm text-muted">Opening your Move Pass…</p>}
        {st.kind === "bad" && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <h1 className="font-display text-xl font-bold">This Move Pass isn&apos;t available</h1>
            <p className="mt-2 text-sm text-muted">The link may be incomplete, or the booking isn&apos;t confirmed yet. Check your latest Bagdrop message or <a className="font-semibold text-brand" href={WA}>WhatsApp us</a>.</p>
          </div>
        )}
        {st.kind === "ok" && <Pass r={st.r} />}
      </div>
    </main>
  );
}

function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{value}</p>
    </div>
  );
}

function Pass({ r }: { r: PassResp }) {
  const p = r.pass;
  return (
    <div className="grid gap-4">
      <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="pass-card overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,.45)] ring-1 ring-line">
        {/* header band */}
        <div className="flex items-center justify-between bg-brand px-5 py-3 text-white sm:px-7">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-extrabold tracking-tight">BAGDROP</span>
            <span className="text-[11px] font-semibold uppercase tracking-[.2em] opacity-90">Move pass</span>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">{p.delivered ? "✓ Delivered" : p.stage}</span>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_230px]">
          {/* main panel */}
          <div className="p-5 sm:p-7">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">From</p>
                <p className="font-mono text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">{p.fromCode}</p>
                <p className="mt-1 text-sm font-semibold text-muted">{p.from}</p>
              </div>
              <div className="mb-6 flex flex-1 items-center gap-2 px-2 text-muted" aria-hidden>
                <span className="h-px flex-1 border-t-2 border-dashed border-line" />
                <span className="text-2xl">{MODE_ICON[p.mode] ?? "🚚"}</span>
                <span className="h-px flex-1 border-t-2 border-dashed border-line" />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">To</p>
                <p className="font-mono text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">{p.toCode}</p>
                <p className="mt-1 text-sm font-semibold text-muted">{p.to}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Field label="Passenger" value={p.name} wide />
              <Field label="Booking" value={<span className="font-mono">{p.ref}</span>} wide />
              <Field label="Pickup" value={day(p.pickupDate)} />
              <Field label="Slot" value={p.slot || "As planned"} />
              <Field label="Delivery by" value={p.deliveryDate ? day(p.deliveryDate) : "As planned"} />
              <Field label="Pieces" value={pcsLabel(p.pieces - p.xl, p.xl)} />
              <Field label="Service" value={p.service} wide />
              <Field label="Mode" value={`${MODE_ICON[p.mode] ?? ""} ${p.mode.charAt(0).toUpperCase()}${p.mode.slice(1)}`} />
              <Field label="Issued" value={day(p.issuedAt.slice(0, 10), { day: "numeric", month: "short" })} />
            </div>

            <div className="mt-5 grid gap-4 border-t border-dashed border-line pt-4 sm:grid-cols-2">
              <Field label="Pickup address" value={<span className="text-[13px] font-medium">{p.pickAddr || "—"}</span>} />
              <Field label="Delivery address" value={<span className="text-[13px] font-medium">{p.dropAddr || "—"}</span>} />
              <Field label="Pickup captain" value={p.pickupCaptain ? <>{p.pickupCaptain.name}{p.pickupCaptain.mobile && <a className="ml-2 text-brand" href={`tel:${p.pickupCaptain.mobile}`}>{p.pickupCaptain.mobile}</a>}</> : <span className="text-[13px] font-medium text-muted">Assigned before pickup</span>} />
              <Field label="Delivery captain" value={p.deliveryCaptain ? <>{p.deliveryCaptain.name}{p.deliveryCaptain.mobile && <a className="ml-2 text-brand" href={`tel:${p.deliveryCaptain.mobile}`}>{p.deliveryCaptain.mobile}</a>}</> : <span className="text-[13px] font-medium text-muted">Assigned before delivery</span>} />
            </div>

            <div className="mt-5 border-t border-dashed border-line pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">Bag tags {p.tags.length ? `· ${p.tags.length}` : ""}</p>
              {p.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span key={t.plate} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2 py-1 font-mono text-[12.5px] font-semibold">
                      <span className="text-muted">{t.n}</span>{t.plate}{t.xl && <b className="rounded bg-ink px-1.5 py-px font-sans text-[10px] text-white">XL</b>}
                    </span>
                  ))}
                </div>
              ) : <p className="mt-1 text-[13px] text-muted">Every bag is tagged at pickup — this pass updates with each tag number.</p>}
            </div>

            <div className="mt-5 [&_svg]:h-14 [&_svg]:w-full [&_svg]:max-w-md" aria-label="PDF417 code" dangerouslySetInnerHTML={{ __html: r.pdf417Svg }} />
          </div>

          {/* claim stub */}
          <div className="relative border-t-2 border-dashed border-line bg-orange-50/40 p-5 md:border-l-2 md:border-t-0 md:p-6">
            <span className="absolute -left-3 -top-3 hidden size-6 rounded-full bg-paper ring-1 ring-line md:block print:hidden" aria-hidden />
            <span className="absolute -bottom-3 -left-3 hidden size-6 rounded-full bg-paper ring-1 ring-line md:block print:hidden" aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">Claim stub</p>
            <div className="mx-auto mt-3 w-44 [&_svg]:h-auto [&_svg]:w-full" aria-label="QR code" dangerouslySetInnerHTML={{ __html: r.qrSvg }} />
            <p className="mt-3 text-center font-mono text-sm font-bold">{p.ref}</p>
            <p className="text-center text-xs text-muted">{p.fromCode} → {p.toCode} · {pcsLabel(p.pieces - p.xl, p.xl)}</p>
            <p className="mt-3 rounded-lg bg-white px-3 py-2 text-center text-[11.5px] leading-snug text-muted ring-1 ring-line">Show this at delivery — the captain scans it and every bag tag, then asks for your delivery OTP.</p>
          </div>
        </div>
      </motion.article>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button onClick={() => window.print()} className="cursor-pointer rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">⬇ Download PDF</button>
        {r.wallet.apple && <a href={`/api/pass/wallet?kind=apple&t=${encodeURIComponent(r.passUrl.split("/p/")[1])}`} className="rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white">Add to Apple Wallet</a>}
        {r.wallet.google && <a href={`/api/pass/wallet?kind=google&t=${encodeURIComponent(r.passUrl.split("/p/")[1])}`} className="rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-bold text-white">Save to Google Wallet</a>}
        {r.trackUrl && <a href={r.trackUrl} className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold">📍 Track live</a>}
        <a href={WA} className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold">WhatsApp Bagdrop</a>
      </div>
      <p className="text-xs text-muted print:hidden">This pass is private — it carries your addresses. Share it only with someone collecting or handing over the bags. {COMPANY.name} · {COMPANY.phone}</p>
    </div>
  );
}
