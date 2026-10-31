"use client";
/** React's "adjust state when an input changes" pattern, in one place.
 *  Instead of an effect that sets state after the screen has already drawn
 *  (an extra render, and a flash of stale values), the change is applied
 *  during the render that sees the new input — React re-renders once,
 *  before anything is painted. See react.dev → "You might not need an
 *  effect" → "Adjusting some state when a prop changes". */
import { useState, type Dispatch, type SetStateAction } from "react";

/** Runs `apply` (which may set this component's state) when `key` changes,
 *  including on the first render — the same timing an effect with that
 *  dependency had, minus the extra paint. */
export function useOnChange(key: string, apply: () => void) {
  const [seen, setSeen] = useState<string | null>(null);
  if (seen !== key) { setSeen(key); apply(); }
}

/** Local, editable copy of `source` that resets whenever the parent hands
 *  down a new `source` (e.g. after a save + refetch). */
export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [local, setLocal] = useState(source);
  const [seen, setSeen] = useState(source);
  if (seen !== source) { setSeen(source); setLocal(source); }
  return [local, setLocal];
}

/** Keeps a form's pickupDate + slot in step with the travel-plan suggestion
 *  until the user picks their own (shared by the website wizard and the
 *  team's quote desk). A field the user changed is never overwritten. */
export function usePlanAutofill<D extends { pickupDate: string; slot: string }>(
  plan: { suggestedPickupDate?: string | null; suggestedSlot?: string | null },
  d: D,
  setD: Dispatch<SetStateAction<D>>,
) {
  const [auto, setAuto] = useState({ pickupDate: "", slot: "" });
  useOnChange(`${plan.suggestedPickupDate ?? ""}|${plan.suggestedSlot ?? ""}`, () => {
    const next = { ...auto };
    const patch: Partial<Pick<D, "pickupDate" | "slot">> = {};
    if (plan.suggestedPickupDate && (!d.pickupDate || d.pickupDate === auto.pickupDate)) {
      next.pickupDate = plan.suggestedPickupDate;
      if (d.pickupDate !== plan.suggestedPickupDate) patch.pickupDate = plan.suggestedPickupDate;
    }
    if (plan.suggestedSlot && (!d.slot || d.slot === auto.slot)) {
      next.slot = plan.suggestedSlot;
      if (d.slot !== plan.suggestedSlot) patch.slot = plan.suggestedSlot;
    }
    if (next.pickupDate !== auto.pickupDate || next.slot !== auto.slot) setAuto(next);
    if (Object.keys(patch).length) setD((p) => ({ ...p, ...patch }));
  });
}
