"use client";
/** Renders one generated document (invoice/receipt/LR/etc.) as an actual
 *  formatted, printable page — the piece that was missing before: the
 *  Finance/LR modules recorded that a document existed (type, number,
 *  amount) but had nothing to show for it. Not a port of the static
 *  build's print-window HTML verbatim, but the same information: company
 *  letterhead, customer/consignment details, GST breakup, doc-type terms. */
import { gstSplit, SAC } from "@/lib/docs";
import { COMPANY, inrWords } from "@/lib/company";
import { inr } from "@/lib/pricing";
import { Button } from "@/components/ui";
import type { Booking, DocRecord, DocType } from "@/lib/types";

const TITLES: Record<DocType, string> = {
  PI: "Proforma Invoice", INV: "Tax Invoice", RCT: "Payment Receipt", CSH: "Cash Receipt",
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

export default function DocumentView({ booking, doc, onClose }: { booking: Booking; doc: DocRecord; onClose: () => void }) {
  const isInvoiceLike = doc.type !== "LR" && doc.type !== "TR" && doc.type !== "MF";
  const split = isInvoiceLike ? gstSplit(doc.amount) : null;

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
            <p className="text-xs text-muted">{booking.bags} bag(s){booking.oversize ? ` + ${booking.oversize} oversize` : ""} · {booking.date}</p>
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
