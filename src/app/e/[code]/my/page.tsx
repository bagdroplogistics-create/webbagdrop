import type { Metadata } from "next";
import MyBags from "./MyBags";

/** /e/[code]/my — the wedding guest dashboard: sign in with the mobile the
 *  family booked with, see every bag's tag code and stage, and book again.
 *
 *  MyBags is entirely a client component that suspends on nothing (plain
 *  useState/useEffect, not a suspending data fetch), so wrapping it in
 *  <Suspense fallback={null}> was unnecessary — and in production it raced
 *  the static/PPR shell and got stuck on that null fallback, loading the
 *  page blank (not reproducible in `next dev`). Removed the Suspense
 *  wrapper in MyBags.tsx instead of forcing this page dynamic, since
 *  `dynamic = "force-dynamic"` isn't allowed with cacheComponents enabled. */
export const metadata: Metadata = {
  title: "My Bags · Y2K Wedding",
};

export default function MyBagsPage() {
  return <MyBags />;
}
