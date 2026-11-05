"use client";
export default function PrintButton() {
  return <button onClick={() => window.print()} className="cursor-pointer rounded-xl border border-line px-3 py-2 text-xs font-semibold print:hidden">Print</button>;
}
