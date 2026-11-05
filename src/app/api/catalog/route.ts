import { NextResponse } from "next/server";
import { airportInfo, cityAirportCodes } from "@/lib/airports";
import { loadInstantConfig, loadMasters } from "@/lib/pricingSettings";
import { effectiveInstant } from "@/lib/instant";

/** Live booking catalog straight from the pricing engine — every city in
 *  the location list, the airport(s) serving it (+ terminals), and which sectors are on
 *  the rate chart. Deliberately NO amounts: prices are only released after
 *  the customer verifies an OTP (/api/booking). */
export async function GET() {
  const [m, { defaults: instantDefaults, all }] = await Promise.all([loadMasters(), loadInstantConfig()]);
  const seen = new Set<string>();
  const cities = m.cities
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .map((c) => { const aps = cityAirportCodes(c); return { name: c.name, ap: aps[0] ?? null, aps }; });
  /* every airport any city lists (main one first per city) */
  const airports = Object.fromEntries(cities.flatMap((c) => c.aps.map((code) => [code, airportInfo(code, c.name)] as const)).reverse());
  /* instant-booking rules per sector (dates, notice, limits — no prices), so
   * the form can say up front whether a date confirms instantly; the server
   * re-checks everything, including capacity, when the booking is made */
  const sectors = m.routes.map((r) => {
    const rule = effectiveInstant(r, all); // the master switch + the route's mode
    return { from: r.from, to: r.to, both: r.dir !== "one", instant: rule ? { ...rule, minNoticeDays: rule.minNoticeDays ?? instantDefaults.minNoticeDays } : null };
  });
  return NextResponse.json({ cities, airports, sectors, instantDefaults }, { headers: { "Cache-Control": "no-store" } });
}
