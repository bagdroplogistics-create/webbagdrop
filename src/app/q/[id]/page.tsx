import { Suspense } from "react";
import QuoteClient from "./QuoteClient";

/** Per-booking quote link: static shell; the id resolves client-side inside
 *  the Suspense boundary (Next 16 prerender rule), and payment is authorised
 *  by /api/pay against the server-side quote signature. */
export default function QuotePage() {
  return (
    <main className="min-h-screen px-4 py-10">
      <header className="mx-auto mb-8 max-w-xl text-center">
        <span className="font-display text-lg font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span></span>
      </header>
      <Suspense fallback={<p className="text-center text-sm text-muted">Loading your quote…</p>}>
        <QuoteClient />
      </Suspense>
    </main>
  );
}
