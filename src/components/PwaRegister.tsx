"use client";
import { useEffect } from "react";

/** Registers the service worker so the booking site installs as an app
 *  (Add to Home Screen on iOS, Install app on Android/desktop). */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort; the site works fine without it */
      });
    }
  }, []);
  return null;
}
