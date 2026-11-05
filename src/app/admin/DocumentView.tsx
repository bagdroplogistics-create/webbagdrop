"use client";
/** Renders one generated document (invoice/receipt/LR/etc.) as an actual
 *  formatted, printable page — the piece that was missing before: the
 *  Finance/LR modules recorded that a document existed (type, number,
 *  amount) but had nothing to show for it. Not a port of the static
 *  build's print-window HTML verbatim, but the same information: company
 *  letterhead, customer/consignment details, GST breakup, doc-type terms. */
import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { useNow } from "@/lib/useNow";
import { withBase } from "@/lib/basePath";
import { gstSplit, SAC, estimateDisplayNo } from "@/lib/docs";
import { COMPANY, inrWords } from "@/lib/company";
import { inr } from "@/lib/pricing";
import { Button } from "@/components/ui";
import type { BagdropEvent, Booking, DocRecord, DocType, HostInvoiceRecord } from "@/lib/types";

const TITLES: Record<DocType, string> = {
  PI: "Estimate", INV: "Tax Invoice", RCT: "Payment Receipt", CSH: "Cash Receipt",
  LR: "Lorry Receipt / Consignment Note", CV: "Credit Voucher", CN: "GST Credit Note",
  TR: "Trip Sheet", MF: "Manifest",
};

const TERMS: Partial<Record<DocType, string[]>> = {
  LR: [
    "Goods insured up to ₹50,000 per shipment unless a higher value is declared and paid for.",
    "Cancellation within 96 hours of scheduled pickup attracts full charges.",
    "Delivery is released only against OTP confirmation from the consignee.",
    "GST charged under GTA (Goods Transport Agency), SAC 9965.",
    "Subject to Vadodara jurisdiction.",
  ],
  INV: ["GST charged under GTA (Goods Transport Agency), SAC 9965.", "Payment due on receipt unless otherwise agreed."],
  PI: ["This is a proforma invoice — not a tax invoice. A Tax Invoice follows on payment confirmation."],
};

import { buildOpsNote, CHARGE_HEADS, lrTotals, type LrDetails as LrD } from "@/lib/lrModel";
import { pcsLabel } from "@/lib/opsModel";

/** The official Bagdrop LR / Consignment Note — pixel layout pulled from the
 *  company's issued format (BDLR series PDF): orange masthead, GC block,
 *  consignor/consignee panels with a full charges column (CGST/SGST 2.5%),
 *  package table, terms strip, authorised signatory. */
function LrNote({ booking: b, doc, onClose }: { booking: Booking; doc: DocRecord; onClose: () => void }) {
  const lr = ((b.admin as { lrDetails?: LrD }).lrDetails ?? {}) as LrD;
  const totals = lrTotals(lr, b.quote.total || doc.amount);
  const pieces = lr.pieces ?? b.bags + b.oversize;
  const paid = b.pay?.status === "captured";
  const gcDate = new Date(doc.at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const CHARGES: [string, number][] = CHARGE_HEADS.map(([k, name]) => [name, Math.round(Number(totals.heads[k]) || 0)]);
  const cell = "border border-stone-300 px-2 py-1";
  const lbl = "block text-[8.5px] font-semibold uppercase tracking-wide text-stone-500";
  const bar = "bg-[#0B1426] px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-white";

  return (
    <div className="print-landscape fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[rgba(10,22,40,0.6)] p-2 lg:p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-[1500px] bg-white shadow-2xl print:max-w-none print:shadow-none">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white p-3 print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => window.print()}>Print</Button>
        </div>

        {/* masthead */}
        <div className="flex items-center justify-between bg-[#EA580C] px-5 py-2.5 text-white">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBase("/images/logo-icon.png")} alt="" className="h-9 w-auto" />
            <div className="font-display text-xl font-extrabold leading-tight">BAGDROP<span className="block text-[8px] font-semibold tracking-[0.2em]">INDIA&apos;S FIRST DIGITAL BAGGAGE INFRASTRUCTURE</span></div>
          </div>
          <div className="text-center">
            <div className="font-display text-lg font-extrabold tracking-wide">CONSIGNMENT NOTE</div>
            <div className="text-[10px] opacity-90">At Owner&apos;s Risk</div>
          </div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&margin=0&data=${encodeURIComponent(doc.no)}`}
              alt={`QR ${doc.no}`}
              className="size-[60px] rounded bg-white p-1"
            />
            <div className="text-right text-[11px]">
              <span className="block text-[8.5px] uppercase opacity-80">GC No.</span>
              <b className="font-mono">{doc.no}</b>
              <span className="block font-semibold">Date: {gcDate}</span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-3 pt-2 text-[11px] text-stone-900">
          {/* company strip */}
          <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2 border-b border-stone-300 pb-1.5">
            <div>
              <b className="text-[12px]">{COMPANY.name}</b>
              <p className="text-[10px] text-stone-600">{COMPANY.address}</p>
            </div>
            <div className="text-right text-[10px] text-stone-600">
              <p>Tel: {COMPANY.phone}</p>
              <p>{COMPANY.email} · {COMPANY.web}</p>
            </div>
          </div>

          {/* identity row */}
          <div className="grid grid-cols-6">
            <div className={cell}><span className={lbl}>PAN No.</span><b className="font-mono">{COMPANY.pan}</b></div>
            <div className={cell}><span className={lbl}>GSTIN</span><b className="font-mono">{COMPANY.gstin}</b></div>
            <div className={cell}><span className={lbl}>GC Date</span><b>{gcDate}</b></div>
            <div className={cell}><span className={lbl}>Vehicle No.</span><b className="font-mono">{lr.vehicleNo ?? "—"}</b></div>
            <div className={cell}><span className={lbl}>From</span><b>{b.from}</b></div>
            <div className={cell}><span className={lbl}>To</span><b>{b.to}</b></div>
          </div>

          {/* consignor / consignee / charges */}
          <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr]">
            <div className="border border-t-0 border-stone-300">
              <div className={bar}>Consignor&apos;s name &amp; address</div>
              <div className="px-2 py-1">
                <b>{lr.consignor ?? COMPANY.name}</b>
                <p className="text-[10px]">{lr.fromAddr ?? b.pickAddr ?? b.from}</p>
                <p className="text-[10px] text-stone-600">Mobile: {lr.consignorMobile ?? COMPANY.phone}</p>
                <p className="text-[10px] text-stone-600">GSTIN: {lr.consignorGstin ?? COMPANY.gstin}</p>
              </div>
            </div>
            <div className="border border-l-0 border-t-0 border-stone-300">
              <div className={bar}>Consignee&apos;s name &amp; address</div>
              <div className="px-2 py-1">
                <b>{lr.consignee ?? b.traveller.name}</b>
                <p className="text-[10px]">{lr.toAddr ?? b.dropAddr ?? b.to}</p>
                <p className="text-[10px] text-stone-600">Mobile: {lr.consigneeMobile ?? b.traveller.mobile}</p>
                <p className="text-[10px] text-stone-600">GSTIN: {lr.consigneeGstin ?? "—"}</p>
              </div>
            </div>
            <div className="border border-l-0 border-t-0 border-stone-300">
              <div className={bar}>Charges</div>
              {CHARGES.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-dashed border-stone-200 px-2 py-[1.5px] text-[10px] last:border-0">
                  <span>{k}</span><span className="font-mono">{v ? inr(v).replace("₹", "") : "0.00"}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-stone-300 px-2 py-[2px] text-[10px] font-bold"><span>Sub Total</span><span className="font-mono">{inr(totals.subTotal).replace("₹", "")}</span></div>
              <div className="flex justify-between px-2 py-[1.5px] text-[10px]"><span>CGST @ 2.5%</span><span className="font-mono">{inr(totals.cgst).replace("₹", "")}</span></div>
              <div className="flex justify-between px-2 py-[1.5px] text-[10px]"><span>SGST @ 2.5%</span><span className="font-mono">{inr(totals.sgst).replace("₹", "")}</span></div>
              <div className="flex justify-between bg-[#EA580C] px-2 py-1 text-[11px] font-bold text-white"><span>Total</span><span className="font-mono">Rs. {inr(totals.total).replace("₹", "")}</span></div>
            </div>
          </div>

          {/* billed to / delivery address */}
          <div className="grid grid-cols-2">
            <div className="border border-t-0 border-stone-300">
              <div className={bar}>Billed to (service receiver)</div>
              <div className="px-2 py-1"><b>{lr.billedTo ?? lr.consignee ?? b.traveller.name}</b><p className="text-[10px] text-stone-600">GSTIN: {lr.billedToGstin ?? "—"}</p></div>
            </div>
            <div className="border border-l-0 border-t-0 border-stone-300">
              <div className={bar}>Delivery address</div>
              <div className="px-2 py-1 text-[10px]">{lr.toAddr ?? b.dropAddr ?? b.to}</div>
            </div>
          </div>

          {/* refs row */}
          <div className="grid grid-cols-4">
            <div className={`${cell} border-t-0`}><span className={lbl}>Invoice / quote no.</span><b className="font-mono">{lr.invoiceRef ?? b.quote.qid ?? "—"}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>Value</span><b>{lr.declaredValue ? inr(lr.declaredValue) : "—"}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>E-way bill no.</span><b className="font-mono">{lr.ewayBill ?? "—"}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>Mode</span><b className="capitalize">{lr.mode ?? b.mode}</b></div>
          </div>

          {/* packages table */}
          <table className="w-full border-collapse">
            <thead>
              <tr>{["Pkgs", "Content", "A Weight", "C Weight", "Size (L×W×H)", "Private Mark", "TI-Tag"].map((h) => <th key={h} className="bg-[#0B1426] px-2 py-1 text-left text-[9.5px] font-bold uppercase tracking-wide text-white">{h}</th>)}</tr>
            </thead>
            <tbody>
              <tr>
                <td className={cell}><b>{pieces}</b></td>
                <td className={cell}>{lr.content ?? "HOUSEHOLD BAGGAGE"}</td>
                <td className={cell}>{lr.weightKg ? `${lr.weightKg} kg` : "—"}</td>
                <td className={cell}>{lr.chargedWeightKg ? `${lr.chargedWeightKg} kg` : "—"}</td>
                <td className={cell}>{lr.size ?? "—"}</td>
                <td className={cell}>{lr.privateMark ?? "—"}</td>
                <td className={cell + " font-mono text-[9px]"}>{lr.tiTag ?? "—"}</td>
              </tr>
            </tbody>
          </table>

          {/* conditions row */}
          <div className="grid grid-cols-4">
            <div className={`${cell} border-t-0`}><span className={lbl}>Material insured by customer</span><b>{lr.insured ?? "No"}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>GST payable by</span><b>{lr.gstPayableBy ?? "Consignor"}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>Payment terms</span><b>{lr.paymentTerms ?? (paid ? "Paid" : "To Pay")}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>LR type</span><b>{lr.lrType ?? "At Branch"}</b></div>
          </div>

          {/* delivery / remarks / signatory — one combined row, same as the issued PDF */}
          <div className="grid min-h-[84px] grid-cols-[0.55fr_0.85fr_1fr_0.8fr]">
            <div className={`${cell} border-t-0`}><span className={lbl}>Delivery at</span><b>{lr.deliveryAt ?? "Door Dly"}</b></div>
            <div className={`${cell} border-l-0 border-t-0`}><span className={lbl}>Remarks</span><b>{lr.note ?? "—"}</b></div>
            <div className={`${cell} border-l-0 border-t-0 flex flex-col justify-end`}>
              <b className="text-[11px]">For {(b.from || "Origin").toUpperCase()} Branch</b>
              <p className="text-[10px] text-stone-600">Prepared by: admin</p>
            </div>
            <div className={`${cell} border-l-0 border-t-0 flex flex-col items-center justify-end text-center`}>
              <b className="text-[10px]">Authorised Signatory</b>
              <p className="text-[9px] text-stone-500">For Bagdrop</p>
            </div>
          </div>

          <p className="mt-2 text-[7.5px] leading-relaxed text-stone-400 print:block">
            {TERMS.LR!.join(" · ")}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Standalone operations note — a short, large-type dispatch slip for the
 *  pickup/delivery team, separate from the official consignment note so
 *  that document stays pixel-exact to the issued BDLR format. Own view +
 *  print button; portrait, since it's one short page, not a wide form. */
export function OpsNoteDoc({ booking: b, onClose }: { booking: Booking; onClose: () => void }) {
  const lr = ((b.admin as { lrDetails?: LrD }).lrDetails ?? {}) as LrD;
  const note = buildOpsNote(b, lr);
  const now = useNow();
  const generatedAt = now ? new Date(now).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-xl bg-white shadow-2xl print:max-w-none print:shadow-none">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white p-3 print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => window.print()}>Print</Button>
        </div>

        {/* masthead — light, not a heavy dark block */}
        <div className="flex items-center justify-between border-b border-line bg-paper/50 px-6 py-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBase("/images/logo-icon.png")} alt="" className="h-8 w-auto" />
            <span className="font-display text-base font-extrabold tracking-tight text-ink">BAGDROP</span>
          </div>
          <div className="text-right text-[11px] text-stone-500">
            <span className="block uppercase tracking-wide">Booking · LR</span>
            <b className="font-mono text-sm text-ink">{b.id} · {b.lr?.no ?? "—"}</b>
          </div>
        </div>

        <div className="px-6 py-6">
          <p className="text-center font-display text-[26px] font-extrabold uppercase tracking-wide text-ink">Operations Note</p>
          <p className="mb-5 text-center text-xs text-faint">For the pickup &amp; delivery team — the essentials only</p>

          {/* customer — the single biggest, boldest line on the slip */}
          <div className="mb-4 rounded-2xl border border-line bg-paper/40 px-4 py-3 text-center">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">Customer</span>
            <span className="block font-display text-3xl font-extrabold leading-tight text-ink">{note.customerName}</span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-dark">Pickup</span>
              <span className="mt-1 block text-lg font-extrabold leading-snug text-ink">{note.pickupAddress}</span>
              <span className="mt-2 inline-block rounded-full bg-brand px-3 py-1 text-[13px] font-bold text-white">{note.pickupWhen}</span>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-blue-700">Delivery</span>
              <span className="mt-1 block text-lg font-extrabold leading-snug text-ink">{note.deliveryAddress}</span>
              <span className="mt-2 inline-block rounded-full bg-blue-600 px-3 py-1 text-[13px] font-bold text-white">{note.deliveryWhen}</span>
            </div>
          </div>

          {/* bags — the other number the team must not get wrong */}
          <div className="rounded-2xl border border-line bg-paper/40 px-4 py-4 text-center">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-faint">Total Bags</span>
            <span className="block font-display text-[48px] font-extrabold leading-none text-ink">{note.bags}</span>
          </div>

          <p className="mt-5 text-center text-[10px] text-faint">Generated automatically from booking {b.id}{generatedAt ? ` · ${generatedAt}` : ""}</p>
        </div>
      </div>
    </div>
  );
}

/** Bag labels — one per piece, same layout as the issued Bagdrop label
 *  (masthead, GC no. + barcode, From → To, Deliver To, Bag N/total,
 *  contents/weight/booked-delivery, consignor + LR type, care strip).
 *  Prints one label per page; on screen they stack with a divider. */
export function BagLabelsDoc({ booking: b, onClose }: { booking: Booking; onClose: () => void }) {
  const lr = ((b.admin as { lrDetails?: LrD }).lrDetails ?? {}) as LrD;
  const gcNo = b.lr?.no ?? "—";
  const gcDate = b.lr?.at ? new Date(b.lr.at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const total = lr.pieces ?? b.bags + b.oversize;
  const bagNumbers = Array.from({ length: Math.max(1, total) }, (_, i) => i + 1);

  const consignor = lr.consignor ?? COMPANY.name;
  const consignorAddr = lr.fromAddr ?? b.pickAddr ?? b.from;
  const consignee = lr.consignee ?? b.traveller.name;
  const consigneeAddr = lr.toAddr ?? b.dropAddr ?? b.to;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-[620px] print:max-w-none">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white p-3 shadow print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <span className="text-xs text-muted">{bagNumbers.length} label{bagNumbers.length > 1 ? "s" : ""}</span>
          <Button size="sm" onClick={() => window.print()}>Print all</Button>
        </div>

        {bagNumbers.map((n) => (
          <div
            key={n}
            className="mb-4 bg-white shadow-2xl print:mb-0 print:shadow-none"
            style={{ breakAfter: n < bagNumbers.length ? "page" : undefined }}
          >
            {/* masthead */}
            <div className="flex items-start justify-between px-6 pt-5">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={withBase("/images/logo-icon.png")} alt="" className="h-14 w-auto" />
              </div>
              <div className="text-right">
                <b className="font-display text-[15px] font-extrabold text-ink">{COMPANY.name}</b>
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand">{COMPANY.tagline}</p>
                <p className="text-[11px] text-stone-600">WhatsApp {COMPANY.phone}</p>
                <p className="text-[11px] text-stone-600">{COMPANY.email} · {COMPANY.web}</p>
              </div>
            </div>
            <div className="mx-6 mt-3 h-[3px] bg-brand" />

            {/* GC no. + barcode */}
            <div className="flex items-start justify-between px-6 pt-4">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-faint">GC No.</span>
                <span className="block font-display text-3xl font-extrabold tracking-tight text-ink">{gcNo}</span>
                <span className="mt-1 block text-[11px] text-stone-600">GC Date <b>{gcDate}</b></span>
              </div>
              <div className="text-right">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://barcodeapi.org/api/128/${encodeURIComponent(`${gcNo}-${String(n).padStart(2, "0")}`)}`}
                  alt={`${gcNo}-${String(n).padStart(2, "0")}`}
                  className="h-16 w-auto"
                />
              </div>
            </div>

            {/* from -> to */}
            <div className="mx-6 mt-4 flex items-center justify-between rounded-2xl bg-brand-soft px-5 py-4">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-faint">From</span>
                <span className="font-display text-3xl font-extrabold uppercase text-ink">{b.from}</span>
              </div>
              <span className="font-display text-sm font-semibold uppercase tracking-wide text-faint">to</span>
              <div className="text-right">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-faint">To</span>
                <span className="font-display text-3xl font-extrabold uppercase text-brand">{b.to}</span>
              </div>
            </div>

            {/* deliver to */}
            <div className="mx-6 mt-4 border-l-4 border-brand pl-4">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-brand">Deliver to</span>
              <span className="block font-display text-xl font-extrabold uppercase text-ink">{consignee}</span>
              <p className="text-[13px] text-stone-700">{consigneeAddr}</p>
            </div>

            {/* bag no. / contents / booked-delivery */}
            <div className="mx-6 mt-4 flex overflow-hidden rounded-xl border border-line">
              <div className="flex flex-col justify-center bg-brand px-4 py-3 text-white">
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">Bag No.</span>
                <span className="font-display text-4xl font-extrabold leading-none">{n}<span className="text-lg font-bold opacity-80">/{bagNumbers.length}</span>{n > total - b.oversize && <span className="ml-1.5 align-middle text-lg font-extrabold">XL</span>}</span>
              </div>
              <div className="grid flex-1 grid-cols-2 divide-x divide-line">
                <div className="px-3 py-2">
                  <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-faint">Contents</span>
                  <b className="text-[13px]">{lr.content ?? "Household Bags"}</b>
                  <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-wide text-faint">Total weight</span>
                  <b className="text-[13px]">{lr.weightKg ? `${lr.weightKg} kg` : "—"} <span className="font-normal text-faint">({bagNumbers.length} pkgs)</span></b>
                </div>
                <div className="px-3 py-2">
                  <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-faint">Booked at</span>
                  <b className="text-[13px]">{b.from}</b>
                  <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-wide text-faint">Delivery at</span>
                  <b className="text-[13px]">{lr.deliveryAt ?? "Door Dly"}</b>
                </div>
              </div>
            </div>

            {/* consignor / LR type */}
            <div className="mx-6 mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600">
              <span><span className="font-semibold uppercase tracking-wide text-faint">Consignor</span> <b className="text-ink">{consignor}</b> · {consignorAddr}</span>
              <span><span className="font-semibold uppercase tracking-wide text-faint">LR type</span> <b className="text-ink">{lr.lrType ?? "At Branch"}</b></span>
            </div>

            {/* care strip */}
            <div className="mx-6 mt-3 rounded-lg border border-dashed border-brand/50 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-brand">
              Handle with care · Keep dry · Do not throw
            </div>

            {/* footer tagline */}
            <div className="mt-4 bg-brand-soft py-2.5 text-center text-[10.5px] font-bold uppercase tracking-[0.15em] text-brand">
              The Baggage Layer · Sealed · Tracked · Insured
            </div>
            <div className="h-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The final host invoice for a host-billed wedding/event (see
 *  /api/admin/events/host-invoice) — same letterhead/GST-split/terms
 *  pattern as the generic invoice view above, but billed to the event's
 *  host (not any one family's own booking), with one line per family. */
export function HostInvoiceDoc({ event, inv, onClose }: { event: BagdropEvent; inv: HostInvoiceRecord; onClose: () => void }) {
  const split = gstSplit(inv.total);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => window.print()}>Print</Button>
        </div>

        <header className="mb-6 border-b-2 border-ink pb-4">
          <h1 className="font-display text-xl font-extrabold">{COMPANY.name}</h1>
          <p className="text-xs text-muted">{COMPANY.address}</p>
          <p className="text-xs text-muted">{COMPANY.phone} · {COMPANY.email} · {COMPANY.web}</p>
          <p className="text-xs text-muted">GSTIN {COMPANY.gstin} · PAN {COMPANY.pan} · SAC {SAC}</p>
        </header>

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Tax Invoice — Event Host Bill</h2>
            <p className="font-mono text-sm">{inv.no}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>Date: {new Date(inv.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            <p>Event: {event.id}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-paper p-3 text-sm">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-faint">Billed to</p>
            <p className="font-medium">{event.contacts?.host || event.name}</p>
            <p className="text-xs text-muted">{event.contacts?.hostMobile ?? ""}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-faint">Event</p>
            <p className="text-xs">{event.name} · {event.venue}, {event.venueCity}</p>
            <p className="text-xs text-muted">{event.dates.in} → {event.dates.out} · {inv.lines.length} famil{inv.lines.length === 1 ? "y" : "ies"}</p>
          </div>
        </div>

        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase text-faint">
              <th className="py-1.5">Family</th><th className="py-1.5 text-right">Bags</th><th className="py-1.5 text-right">Rate</th><th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.bookingId} className="border-b border-dashed border-line">
                <td className="py-1.5">{l.family}{l.oversize ? <span className="text-faint"> · {l.oversize} oversize</span> : null}</td>
                <td className="py-1.5 text-right">{l.billedBags}{l.billedBags !== l.bags ? <span className="text-faint"> (min {l.billedBags})</span> : null}</td>
                <td className="py-1.5 text-right">{inr(l.rate)}</td>
                <td className="py-1.5 text-right">{inr(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-b border-dashed border-line"><td className="py-1.5" colSpan={3}>Subtotal</td><td className="py-1.5 text-right">{inr(inv.subtotal)}</td></tr>
            {inv.discountPct > 0 && (
              <tr className="border-b border-dashed border-line"><td className="py-1.5" colSpan={3}>Volume discount ({inv.discountPct}%)</td><td className="py-1.5 text-right">−{inr(inv.discount)}</td></tr>
            )}
            <tr className="border-b border-dashed border-line"><td className="py-1.5" colSpan={3}>Taxable value</td><td className="py-1.5 text-right">{inr(split.taxable)}</td></tr>
            <tr className="border-b border-dashed border-line"><td className="py-1.5" colSpan={3}>GST 5% (SAC {SAC})</td><td className="py-1.5 text-right">{inr(split.gst)}</td></tr>
            <tr className="font-semibold"><td className="py-1.5" colSpan={3}>Total</td><td className="py-1.5 text-right">{inr(inv.total)}</td></tr>
          </tbody>
        </table>

        <p className="mb-4 text-xs italic text-muted">{inrWords(inv.total)}</p>

        <div className="mb-4 rounded-xl bg-paper p-3 text-[11px] text-muted">
          <p className="mb-1 font-semibold text-ink">Terms</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>GST charged under GTA (Goods Transport Agency), SAC {SAC}.</li>
            <li>Computed from the event&apos;s Commercials and every family&apos;s final confirmed bag count at the time of issue.</li>
            <li>Payment due on receipt unless otherwise agreed.</li>
          </ul>
        </div>

        <p className="text-center text-[11px] text-faint">This is a system-generated document. Issued by {inv.by}.</p>
      </div>
    </div>
  );
}

/** The ten numbered terms every live bagdrop.co quote carries — kept as a
 *  fixed constant rather than config, since these are legal boilerplate,
 *  not something a desk should be able to accidentally edit. */
const ESTIMATE_TERMS = [
  "Booking Confirmation: All bookings are confirmed upon receipt of the total amount payable. A unique CN (Confirmation) number will be provided for your reference.",
  "Total Amount Payable: The total amount payable for the baggage service is as per the policy.",
  "Included Services: Only the services mentioned above in the Estimate shall be included and the company reserves all rights to Cancel at any point.",
  "Prohibited Items: Luggage should not contain any items prohibited by the government or legal system. Alcohol and Illegal substance is strictly prohibited. All bags are processed through the Govt Screening processes.",
  "Assistance and Queries: For any assistance or queries, clients can contact BAGDROP at 63 5711 5711 / 63 5733 5733 or via email at info@bagdrop.co",
  "Payment Confirmation: Clients are requested to share a screenshot of the payment confirmation for booking verification.",
  "Cancellation Policy: All Destinations: Cancellations must be made at least 7 days before the scheduled pick-up time to receive a full refund.",
  "Liability: BAGDROP is not liable for any loss, damage, or theft of items during transportation. Clients are advised to secure valuable items and carry essential documents with them. No Illegal items and Alcohol shall be kept in the luggage bags given for Shipment.",
  "The services are subject to availability at the time of booking. The rates may vary or change at any time without any prior Notice.",
  "Terms Acceptance: Booking with BAGDROP implies acceptance of these terms and conditions. We appreciate your trust in BAGDROP for your baggage transportation needs.",
];

/** The customer-ready quotation — bagdrop.co's own live "QT-…" estimate
 *  format, reproduced field-for-field from a real issued example. Internally
 *  this is a "PI" doc (src/lib/types.ts's DocType) so it shares the same
 *  race-safe next_doc_no() numbering Finance already uses for every other
 *  document — estimateDisplayNo() only changes how the stored "PI/…" number
 *  is PRINTED ("QT/…"), never what's actually stored/unique. Auto-issued the
 *  moment a non-hosted inquiry is Accepted (src/app/api/admin/decision),
 *  so there's no separate "generate quote" step. */
function EstimateDoc({ booking: b, doc, onClose }: { booking: Booking; doc: DocRecord; onClose: () => void }) {
  const [pay, setPay] = useState<{ upiId?: string; payeeName?: string; bankName?: string; accountName?: string; accountNo?: string; ifsc?: string } | null>(null);
  useEffect(() => { void fetch("/api/payconfig").then((r) => r.json()).then((j) => setPay(j.config ?? {})).catch(() => setPay({})); }, []);

  const pageRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  async function downloadPdf() {
    const node = pageRef.current;
    if (!node || downloading) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: JsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      const img = canvas.toDataURL("image/png");
      let y = 0, remaining = imgH;
      pdf.addImage(img, "PNG", 0, y, pageW, imgH);
      remaining -= pageH;
      while (remaining > 0) {
        y = remaining - imgH;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, y, pageW, imgH);
        remaining -= pageH;
      }
      pdf.save(`Estimate-${estimateDisplayNo(doc.no).replace(/\//g, "-")}.pdf`);
    } catch (e) {
      console.error("Estimate PDF download failed:", e instanceof Error ? e.message : e);
      alert("Couldn't build the PDF — try Print instead and save as PDF from there.");
    } finally {
      setDownloading(false);
    }
  }

  const split = gstSplit(b.quote.total || doc.amount);
  const cgst = Math.round(split.gst / 2), sgst = split.gst - cgst;
  const pcs = b.bags + b.oversize;
  const dateStr = (s?: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const pickupDate = b.pickupDate || b.date;

  const upiUri = pay?.upiId ? `upi://pay?pa=${encodeURIComponent(pay.upiId)}&pn=${encodeURIComponent(pay.payeeName ?? "Bagdrop Logistics Solutions")}&am=${b.quote.total}&tn=${encodeURIComponent(estimateDisplayNo(doc.no))}&cu=INR` : "";
  const qrSvg = useMemo(() => {
    if (!upiUri) return "";
    const qr = qrcode(0, "M");
    qr.addData(upiUri);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 1, scalable: true });
  }, [upiUri]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-2 lg:p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-[900px] bg-white shadow-2xl print:max-w-none print:shadow-none">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-white p-3 print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
            <Button size="sm" disabled={downloading} onClick={() => void downloadPdf()}>{downloading ? "Preparing…" : "Download PDF"}</Button>
          </div>
        </div>

        <div ref={pageRef}>
        {/* masthead */}
        <div className="flex items-start justify-between bg-[#EA580C] px-6 py-4 text-white">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBase("/images/logo-icon.png")} alt="" className="mb-1 h-9 w-auto" />
            <div className="font-display text-xl font-extrabold leading-tight">BAGDROP</div>
            <div className="text-[9px] font-semibold tracking-[0.2em] opacity-90">INDIA&apos;S FIRST DIGITAL BAGGAGE INFRASTRUCTURE</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold tracking-[0.25em] opacity-90">ESTIMATE</div>
            <div className="font-display text-lg font-extrabold">{estimateDisplayNo(doc.no)}</div>
            <div className="mt-0.5 text-[11px] font-semibold tracking-[0.2em] opacity-90">PICKUP</div>
            <div className="font-display text-lg font-extrabold">{dateStr(pickupDate)}</div>
          </div>
        </div>

        {/* info strip */}
        <div className="grid grid-cols-2 gap-2 bg-orange-50 px-6 py-2.5 text-[11px] sm:grid-cols-4">
          <div><span className="block text-[9px] font-semibold uppercase tracking-wide text-stone-500">GSTIN</span><b>{COMPANY.gstin}</b></div>
          <div><span className="block text-[9px] font-semibold uppercase tracking-wide text-stone-500">SAC code</span><b>{SAC}</b></div>
          <div><span className="block text-[9px] font-semibold uppercase tracking-wide text-stone-500">Booking ref</span><b className="font-mono">{b.id}</b></div>
          <div><span className="block text-[9px] font-semibold uppercase tracking-wide text-stone-500">Salesperson</span><b>{doc.by ?? "—"}</b></div>
        </div>

        <div className="px-6 py-4 text-[12px] text-stone-900">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper p-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">Bill to</p>
              <p className="font-semibold">{b.traveller.title ? `${b.traveller.title} ` : ""}{b.traveller.name}</p>
              <p className="text-stone-600">{b.traveller.mobile}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper p-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">Journey details</p>
              <p><span className="text-stone-500">From</span> <b className="uppercase">{b.from}</b> → <span className="text-stone-500">To</span> <b className="uppercase">{b.to}</b></p>
              <p className="text-stone-600">Pickup: {dateStr(pickupDate)}{b.deliveryDate ? ` · Delivery: ${dateStr(b.deliveryDate)}` : ""}</p>
              <p className="text-stone-600">Bags: {pcs}</p>
            </div>
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper p-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">Pickup address</p>
              <p className="text-stone-700">{b.pickAddr || b.from}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper p-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">Delivery address</p>
              <p className="text-stone-700">{b.dropAddr || b.to}</p>
            </div>
          </div>

          <p className="mb-3 border-l-2 border-[#EA580C] pl-2 text-[11px]"><b>Pick up date:</b> {dateStr(pickupDate)}</p>

          <table className="mb-4 w-full text-[11px]">
            <thead>
              <tr className="bg-stone-900 text-left text-[10px] uppercase text-white">
                <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Description</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5">Tax</th><th className="px-2 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="px-2 py-1.5">1</td>
                <td className="px-2 py-1.5">Transportation of Bags (Upto {pcs} Bags) — {b.from} → {b.to}</td>
                <td className="px-2 py-1.5 text-right">{pcs}</td>
                <td className="px-2 py-1.5 text-right">{inr(split.taxable)}</td>
                <td className="px-2 py-1.5">GST 5%</td>
                <td className="px-2 py-1.5 text-right">{inr(split.taxable)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">Payment details</p>
              {pay?.upiId ? (
                <div className="flex items-start gap-3">
                  <div className="grid gap-0.5 text-[11px]">
                    {pay.bankName && <p><span className="text-stone-500">Bank:</span> <b>{pay.bankName}</b></p>}
                    {pay.accountNo && <p><span className="text-stone-500">A/C No:</span> <b className="font-mono">{pay.accountNo}</b></p>}
                    {pay.ifsc && <p><span className="text-stone-500">IFSC:</span> <b className="font-mono">{pay.ifsc}</b></p>}
                    <p><span className="text-stone-500">UPI:</span> <b className="font-mono">{pay.upiId}</b></p>
                  </div>
                  {qrSvg && <div className="w-[80px] shrink-0 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
                </div>
              ) : <p className="text-[11px] text-stone-500">Payment details are being set up — our team will share them with you directly.</p>}
            </div>
            <div>
              <table className="w-full text-[11px]">
                <tbody>
                  <tr><td className="py-0.5 text-stone-600">Sub Total</td><td className="py-0.5 text-right">{inr(split.taxable)}</td></tr>
                  <tr><td className="py-0.5 text-stone-600">CGST @ 2.5%</td><td className="py-0.5 text-right">{inr(cgst)}</td></tr>
                  <tr><td className="py-0.5 text-stone-600">SGST @ 2.5%</td><td className="py-0.5 text-right">{inr(sgst)}</td></tr>
                  <tr className="border-t border-line"><td className="py-1 font-bold">Total Amount</td><td className="py-1 text-right font-display text-base font-extrabold text-[#EA580C]">{inr(split.taxable + cgst + sgst)}</td></tr>
                </tbody>
              </table>
              <div className="mt-2 rounded-lg bg-amber-50 p-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-800">Amount in words</p>
                <p className="text-[11px] italic text-amber-900">{inrWords(split.taxable + cgst + sgst)}</p>
              </div>
            </div>
          </div>

          <div className="mb-3 border-l-2 border-[#EA580C] pl-2">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">Subject text</p>
            <p className="text-[11px]">Transportation of Bags From {b.from} to {b.to}</p>
          </div>

          <div className="mb-4 rounded-xl bg-paper p-3 text-[9.5px] text-stone-600">
            <p className="mb-1.5 font-semibold text-ink">Terms &amp; Conditions</p>
            <ol className="grid list-decimal gap-x-4 gap-y-1 pl-4 sm:grid-cols-2">
              {ESTIMATE_TERMS.map((t, i) => <li key={i} className="leading-snug">{t}</li>)}
            </ol>
          </div>

          <div className="flex items-end justify-between border-t border-line pt-3 text-[10px] text-stone-500">
            <div>
              <p className="font-semibold text-ink">{COMPANY.name}</p>
              <p>{COMPANY.address}</p>
              <p>GSTIN: {COMPANY.gstin} · Tel: {COMPANY.phone} · {COMPANY.email} · {COMPANY.web}</p>
            </div>
            <div className="text-right">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={withBase("/images/signature-stamp.png")} alt="" className="ml-auto mb-1 h-16 w-16 object-contain" />
              <p className="border-t border-stone-400 pt-1 font-semibold text-ink">Authorized Signatory</p>
              <p>For {COMPANY.name}</p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentView({ booking, doc, onClose }: { booking: Booking; doc: DocRecord; onClose: () => void }) {
  const isInvoiceLike = doc.type !== "LR" && doc.type !== "TR" && doc.type !== "MF";
  const split = isInvoiceLike ? gstSplit(doc.amount) : null;

  if (doc.type === "LR") return <LrNote booking={booking} doc={doc} onClose={onClose} />;
  if (doc.type === "PI") return <EstimateDoc booking={booking} doc={doc} onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => window.print()}>Print</Button>
        </div>

        <header className="mb-6 border-b-2 border-ink pb-4">
          <h1 className="font-display text-xl font-extrabold">{COMPANY.name}</h1>
          <p className="text-xs text-muted">{COMPANY.address}</p>
          <p className="text-xs text-muted">{COMPANY.phone} · {COMPANY.email} · {COMPANY.web}</p>
          <p className="text-xs text-muted">GSTIN {COMPANY.gstin} · PAN {COMPANY.pan} · SAC {SAC}</p>
        </header>

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">{TITLES[doc.type]}</h2>
            <p className="font-mono text-sm">{doc.no}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>Date: {new Date(doc.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            <p>Booking: {booking.id}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-paper p-3 text-sm">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-faint">Billed to</p>
            <p className="font-medium">{booking.traveller.title ? `${booking.traveller.title} ` : ""}{booking.traveller.name}</p>
            <p className="text-xs text-muted">{booking.traveller.mobile}{booking.traveller.email ? ` · ${booking.traveller.email}` : ""}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-faint">Consignment</p>
            <p className="text-xs">{booking.from} → {booking.to}</p>
            <p className="text-xs text-muted">{pcsLabel(booking.bags, booking.oversize)} · {booking.date}</p>
          </div>
        </div>


        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase text-faint">
              <th className="py-1.5">Particulars</th><th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {split ? (
              <>
                <tr className="border-b border-dashed border-line"><td className="py-1.5">Transport charges ({booking.ucName})</td><td className="py-1.5 text-right">{inr(split.taxable)}</td></tr>
                <tr className="border-b border-dashed border-line"><td className="py-1.5">GST 5% (SAC {SAC})</td><td className="py-1.5 text-right">{inr(split.gst)}</td></tr>
                <tr className="font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{inr(doc.amount)}</td></tr>
              </>
            ) : (
              <tr className="font-semibold"><td className="py-1.5">{booking.from} → {booking.to}</td><td className="py-1.5 text-right">{inr(doc.amount)}</td></tr>
            )}
          </tbody>
        </table>

        {split && <p className="mb-4 text-xs italic text-muted">{inrWords(doc.amount)}</p>}

        {TERMS[doc.type] && (
          <div className="mb-4 rounded-xl bg-paper p-3 text-[11px] text-muted">
            <p className="mb-1 font-semibold text-ink">Terms</p>
            <ul className="list-inside list-disc space-y-0.5">
              {TERMS[doc.type]!.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}

        <p className="text-center text-[11px] text-faint">This is a system-generated document.</p>
      </div>
    </div>
  );
}
