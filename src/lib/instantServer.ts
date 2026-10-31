/** Server side of instant booking: the live defaults + the capacity count,
 *  then the shared rule in src/lib/instant.ts. Used by the website booking
 *  route and the partner desk so both decide identically. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { instantCheck, instantTaken, type InstantDefaults, type InstantResult } from "./instant";
import { loadInstantDefaults } from "./pricingSettings";
import { istToday } from "./services";
import type { Booking, RouteRate } from "./types";

export async function decideInstant(sb: SupabaseClient, route: RouteRate | undefined, req: { date: string; bags: number; oversize: number }): Promise<{ result: InstantResult; defaults: InstantDefaults } | null> {
  if (!route?.instant?.enabled) return null;
  const defaults = await loadInstantDefaults();
  let taken = 0;
  if (route.instant.dailyCap) {
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const { data } = await sb.from("bookings").select("doc").gte("created", since).limit(2000);
    taken = instantTaken((data ?? []).map((r) => r.doc as Booking), route, Date.now())[req.date] ?? 0;
  }
  return { result: instantCheck(route, req, istToday(), defaults, taken), defaults };
}
