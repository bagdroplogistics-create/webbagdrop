"use client";
/** Wedding guest landing page — /weddings?code=<EVENT-CODE>. Ported from the
 *  static build's wedding.html/.css/.js with the markup and styles verbatim
 *  (see markup.ts) and the behaviour in logic.ts. It keeps the original's
 *  vanilla-DOM approach on purpose: the page was signed off pixel-for-pixel,
 *  so we drive the same ids rather than re-building it as JSX.
 *
 *  The Y2K event is special-cased the same way /e/[code]/page.tsx does it:
 *  its own full page (hero, celebration, destination, travel, booking desk)
 *  replaces this generic template, so /weddings?code=Y2K-WED and /e/Y2K
 *  show the same, single, up-to-date design rather than two different ones. */
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Y2kDesk from "../e/[code]/Y2kDesk";
import { initWeddingLanding } from "./logic";
import { WEDDING_CSS, WEDDING_HTML } from "./markup";

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&display=swap";
const Y2K_CODES = new Set(["Y2K", "Y2K-WED", "#Y2K"]);

export default function WeddingsPage() {
  return (
    <Suspense fallback={null}>
      <WeddingsByCode />
    </Suspense>
  );
}

function WeddingsByCode() {
  const code = (useSearchParams().get("code") ?? "").trim().toUpperCase();
  if (Y2K_CODES.has(code)) return <Y2kDesk />;
  return <GenericLanding />;
}

function GenericLanding() {
  useEffect(() => initWeddingLanding(), []);
  return (
    <div className="w-full">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href={FONTS} />
      <style dangerouslySetInnerHTML={{ __html: WEDDING_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: WEDDING_HTML }} />
    </div>
  );
}
