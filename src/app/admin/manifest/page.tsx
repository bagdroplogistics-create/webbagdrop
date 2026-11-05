import { Suspense } from "react";
import ManifestClient from "./ManifestClient";

export const metadata = { title: "Event manifest · BAGDROP OS" };

/** /admin/manifest?event=<code> — plan every pickup, delivery and return of
 *  an event; printable; behind the admin sign-in (src/proxy.ts). */
export default function ManifestPage() {
  return <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}><ManifestClient /></Suspense>;
}
