"use client";
/** The Y2K wedding desk page — markup/styles verbatim from the static
 *  y2k.html, behaviour in y2k-logic.ts. Kept as vanilla DOM on purpose:
 *  the page was signed off pixel-for-pixel ("make no mistakes"), so we
 *  drive the exact same ids rather than re-building it as JSX. */
import { useEffect } from "react";
import { initY2k } from "./y2k-logic";
import { Y2K_CSS, Y2K_HTML } from "./y2k-markup";
import { BASE_PATH } from "@/lib/basePath";

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap";

/** Y2K_HTML has a handful of hardcoded same-origin paths (image srcs, the
 *  My Bags link) baked into its markup string — Next's basePath can't
 *  rewrite those since they're never parsed as JSX. Prefix them here,
 *  once, the same way withBase() would for a real attribute. */
const PREFIXED_HTML = BASE_PATH
  ? Y2K_HTML.replaceAll('href="/e/y2k/my"', `href="${BASE_PATH}/e/y2k/my"`)
      .replaceAll('src="/images/', `src="${BASE_PATH}/images/`)
      .replaceAll('src="/logo-white.png"', `src="${BASE_PATH}/logo-white.png"`)
  : Y2K_HTML;

export default function Y2kDesk() {
  useEffect(() => initY2k(), []);
  return (
    <div className="w-full">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS} />
      <style dangerouslySetInnerHTML={{ __html: Y2K_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: PREFIXED_HTML }} />
    </div>
  );
}
