"use client";
import { useEffect } from "react";
import { withBase } from "@/lib/basePath";

/** Registers the service worker so the booking site installs as an app
 *  (Add to Home Screen on iOS, Install app on Android/desktop). A raw
 *  "/sw.js" bypasses basePath (see src/lib/basePath.ts); on a basePath
 *  build that 308-redirects through bagdrop-web's host redirect, and
 *  browsers refuse to register a service worker behind a redirect. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(withBase("/sw.js")).catch(() => {
        /* registration is best-effort; the site works fine without it */
      });
    }
  }, []);
  return null;
}
