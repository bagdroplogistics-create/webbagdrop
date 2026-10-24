"use client";
/** Wedding guest landing page — /weddings?code=<EVENT-CODE>. Ported from the
 *  static build's wedding.html/.css/.js with the markup and styles verbatim
 *  (see markup.ts) and the behaviour in logic.ts. It keeps the original's
 *  vanilla-DOM approach on purpose: the page was signed off pixel-for-pixel,
 *  so we drive the same ids rather than re-building it as JSX. */
import { useEffect } from "react";
import { initWeddingLanding } from "./logic";
import { WEDDING_CSS, WEDDING_HTML } from "./markup";

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&display=swap";

export default function WeddingsPage() {
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
