"use client";
/** UPI payment panel — the QR is generated on this device (no third-party
 *  QR service ever sees the UPI ID, amount or booking reference). The
 *  amount and reference are embedded, so Google Pay / PhonePe / Paytm /
 *  BHIM open ready to pay. Bank details come from Finance → Banking. */
import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { inr } from "@/lib/pricing";
import { Button } from "@/components/ui";

export interface PayTo { upiId?: string; payeeName?: string; bankName?: string; accountName?: string; accountNo?: string; ifsc?: string; note?: string }

export default function UpiPay({ amount, reference, payTo }: { amount: number; reference: string; payTo: PayTo }) {
  const uri = payTo.upiId
    ? `upi://pay?pa=${encodeURIComponent(payTo.upiId)}&pn=${encodeURIComponent(payTo.payeeName ?? "Bagdrop Logistics Solutions")}&am=${amount}&tn=${encodeURIComponent(reference)}&cu=INR`
    : "";
  const svg = useMemo(() => {
    if (!uri) return "";
    const qr = qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [uri]);

  if (!payTo.upiId) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Payment details are being set up — our team will share them with you directly.</p>;
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Pay {inr(amount)} by UPI · Google Pay, PhonePe, Paytm, BHIM</p>
      <div className="grid items-start gap-4 sm:grid-cols-[150px_1fr]">
        <div className="mx-auto w-[150px] rounded-xl border border-line bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="text-sm">
          <p>Scan with any UPI app — <b>{inr(amount)}</b> and reference <b className="font-mono text-xs">{reference}</b> are pre-filled.</p>
          <p className="mt-2 text-xs text-muted">Or pay to UPI ID:</p>
          <p className="flex flex-wrap items-center gap-2">
            <b className="rounded bg-paper px-2 py-1 font-mono text-[13px]">{payTo.upiId}</b>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(payTo.upiId!)}>Copy</Button>
            <a className="text-xs font-semibold text-brand underline sm:hidden" href={uri}>Open UPI app →</a>
          </p>
          {(payTo.accountNo || payTo.bankName) && (
            <p className="mt-2 text-xs text-muted">Bank transfer: <b>{payTo.accountName ?? payTo.payeeName}</b>{payTo.bankName ? ` · ${payTo.bankName}` : ""}{payTo.accountNo ? ` · A/c ${payTo.accountNo}` : ""}{payTo.ifsc ? ` · IFSC ${payTo.ifsc}` : ""}</p>
          )}
          <p className="mt-1 text-[11px] font-semibold text-amber-800">Please check the payee name ({payTo.payeeName ?? "Bagdrop Logistics Solutions"}) before paying.</p>
          {payTo.note && <p className="mt-0.5 text-[11px] text-faint">{payTo.note}</p>}
        </div>
      </div>
    </div>
  );
}
