"use client";
import { useEffect } from "react";

/** Runs a screen's `load` when it opens and, with `everyMs`, polls it on
 *  that interval until the screen closes. `load` should be stable
 *  (useCallback) — a new function restarts the cycle. State is set only
 *  after the fetch resolves, so there is no render cascade on open. */
export function useLoad(load: () => unknown, everyMs?: number) {
  useEffect(() => {
    void load();
    if (!everyMs) return;
    const t = setInterval(() => void load(), everyMs);
    return () => clearInterval(t);
  }, [load, everyMs]);
}
