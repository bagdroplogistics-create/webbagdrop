import type { Metadata } from "next";
import { Suspense } from "react";
import Y2kDesk from "./Y2kDesk";

/** /e/[code] — on-site wedding desks by event code. Today that's the Y2K
 *  wedding desk (codes "y2k" / "Y2K-WED"); other codes get the same gentle
 *  "not open yet" the landing page shows. Append ?ops=1 (signed in at
 *  /admin) for the on-site ops manifest. */

export const metadata: Metadata = {
  title: "Y2K Wedding Bag Desk",
};

const Y2K_CODES = new Set(["Y2K", "Y2K-WED", "#Y2K"]);

export default function EventDeskPage({ params }: PageProps<"/e/[code]">) {
  // params is awaited inside <Suspense> so the shell still prerenders
  // (Next 16 Cache Components requirement).
  return (
    <Suspense fallback={null}>
      <Desk params={params} />
    </Suspense>
  );
}

async function Desk({ params }: { params: PageProps<"/e/[code]">["params"] }) {
  const { code } = await params;
  const norm = decodeURIComponent(code).trim().toUpperCase();
  if (Y2K_CODES.has(norm)) return <Y2kDesk />;
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: "80px 24px", fontFamily: "Georgia, serif" }}>
      <div>
        <h2 style={{ fontWeight: 400, fontSize: 40, margin: "0 0 10px" }}>This page is not open yet.</h2>
        <p style={{ color: "#5A5145", margin: 0 }}>Check the link on your invitation, or ask the hosts for a fresh one.</p>
      </div>
    </div>
  );
}
