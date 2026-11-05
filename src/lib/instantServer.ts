/** Server side of instant booking: the live defaults + the capacity count,
 *  then the shared rule in src/lib/instant.ts. Used by the website booking
 *  route and the partner desk so both decide identically. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveInstant, instantCheck, instantTaken, type InstantDefaults, type InstantResult } from "./instant";
import { loadInstantConfig } from "./pricingSettings";
import { istToday } from "./services";
import type { Booking, RouteRate } from "./types";

export async function decideInstant(sb: SupabaseClient, route: RouteRate | undefined, req: { date: string; bags: number; oversize: number }): Promise<{ result: InstantResult; defaults: InstantDefaults } | null> {
  const { defaults, all } = await loadInstantConfig();
  const rule = effectiveInstant(route, all);
  if (!route || !rule) return null; // master switch off, route off, or no rule → team approval
  let taken = 0;
  if (rule.dailyCap) {
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const { data } = await sb.from("bookings").select("doc").gte("created", since).limit(2000);
    taken = instantTaken((data ?? []).map((r) => r.doc as Booking), route, Date.now())[req.date] ?? 0;
  }
  return { result: instantCheck(route, req, istToday(), defaults, taken, all), defaults };
}
