import type { Metadata } from "next";
import { Suspense } from "react";
import DriverClient from "./DriverClient";

/** /d/[token] — the driver's page for one leg of one booking: tap Start
 *  trip and the phone shares its location until Done (or the leg's
 *  milestone is scanned). The token is signed (src/lib/trackLinks.ts). */

export const metadata: Metadata = {
  title: "Driver · Bagdrop",
  robots: { index: false, follow: false },
};

export default function DriverPage({ params }: PageProps<"/d/[token]">) {
  return (
    <Suspense fallback={null}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: { params: PageProps<"/d/[token]">["params"] }) {
  const { token } = await params;
  return <DriverClient token={decodeURIComponent(token)} />;
}
