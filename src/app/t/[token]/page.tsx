import type { Metadata } from "next";
import { Suspense } from "react";
import TrackClient from "./TrackClient";

/** /t/[token] — the shareable live-tracking page for one booking. The token
 *  is signed (src/lib/trackLinks.ts); the page works until delivery. */

export const metadata: Metadata = {
  title: "Track your bags · Bagdrop",
  robots: { index: false, follow: false },
};

export default function TrackPage({ params }: PageProps<"/t/[token]">) {
  return (
    <Suspense fallback={null}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: { params: PageProps<"/t/[token]">["params"] }) {
  const { token } = await params;
  return <TrackClient token={decodeURIComponent(token)} />;
}
