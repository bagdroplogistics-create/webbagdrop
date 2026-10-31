"use client";
import { useSyncExternalStore } from "react";

/** The current time for screens that compute "today", ages or SLAs.
 *  null during the server render and the hydration pass (so server and
 *  browser HTML always match), then the browser's clock, refreshed every
 *  minute so "today" rolls over at midnight without a reload. Use it as a
 *  useMemo dependency instead of reading Date.now() inside an effect. */
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) timer = setInterval(() => { now = Date.now(); subs.forEach((f) => f()); }, 60_000);
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) { clearInterval(timer); timer = undefined; }
  };
}
function snapshot() { if (!now) now = Date.now(); return now; }

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, snapshot, () => 0) || null;
}
