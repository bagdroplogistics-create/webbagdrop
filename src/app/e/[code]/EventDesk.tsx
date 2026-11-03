"use client";
/** Picks the desk for an event code in the browser (useParams), the same
 *  way /weddings?code= does. The server-side version awaited params inside
 *  <Suspense>; the desk's markup streamed in but its useEffect never ran, so
 *  the booking wizard, countdown and tracker stayed empty. The boundary sits
 *  here, inside the client component, exactly like /weddings. */
import { Suspense } from "react";
import { useParams } from "next/navigation";
import Y2kDesk from "./Y2kDesk";

const Y2K_CODES = new Set(["Y2K", "Y2K-WED", "#Y2K"]);

export default function EventDesk() {
  return (
    <Suspense fallback={null}>
      <DeskByCode />
    </Suspense>
  );
}

function DeskByCode() {
  const { code = "" } = useParams<{ code: string }>();
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
