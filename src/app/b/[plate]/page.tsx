import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { parsePlate, spaced } from "@/lib/bagTags";
import { COMPANY } from "@/lib/company";

/** /b/[plate] — what the QR on every Bagdrop bag tag opens. Like an
 *  airline's found-baggage notice: it confirms the tag is genuine (check
 *  digit) and gets the finder to Bagdrop. No customer data is shown. */

export const metadata: Metadata = { title: "Bagdrop bag tag", robots: { index: false, follow: false } };

export default function BagPage({ params }: PageProps<"/b/[plate]">) {
  return (
    <Suspense fallback={null}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: { params: PageProps<"/b/[plate]">["params"] }) {
  const { plate } = await params;
  const p = parsePlate(decodeURIComponent(plate));
  const wa = `https://wa.me/${COMPANY.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi Bagdrop, I have found a bag with tag ${p ? spaced(p.canon) : plate}.`)}`;
  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white px-4 py-3">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight">BAG<span className="text-brand">DROP</span></Link>
      </header>
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-2xl border border-line bg-white p-6">
          {p?.valid ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Genuine Bagdrop bag tag</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tracking-wide">{spaced(p.canon)}</p>
              <p className="mt-3 text-sm text-muted">This bag is in Bagdrop&apos;s care, sealed and tracked from pickup to delivery. If you found it away from a Bagdrop captain or hub, please tell us — we&apos;ll collect it.</p>
              <a href={wa} className="mt-5 block rounded-xl bg-brand px-4 py-3 text-center font-bold text-white">WhatsApp Bagdrop</a>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="mt-2 block text-center text-sm font-semibold text-brand">Call {COMPANY.phone}</a>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-bold">This isn&apos;t a valid Bagdrop tag</p>
              <p className="mt-2 text-sm text-muted">The number doesn&apos;t pass its check digit — it may have been mistyped or damaged. Please call {COMPANY.phone} with the number on the tag.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
