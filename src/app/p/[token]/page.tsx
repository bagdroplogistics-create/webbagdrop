import type { Metadata } from "next";
import { Suspense } from "react";
import PassClient from "./PassClient";

/** /p/[token] — the customer's Move Pass (boarding-pass style). Signed
 *  link (src/lib/trackLinks.ts); printable to PDF; wallet-ready. */

export const metadata: Metadata = {
  title: "Move Pass · Bagdrop",
  robots: { index: false, follow: false },
};

export default function PassPage({ params }: PageProps<"/p/[token]">) {
  return (
    <Suspense fallback={null}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: { params: PageProps<"/p/[token]">["params"] }) {
  const { token } = await params;
  return <PassClient token={decodeURIComponent(token)} />;
}
