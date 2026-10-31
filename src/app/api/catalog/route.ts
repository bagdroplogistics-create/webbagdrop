import { NextResponse } from "next/server";
import { AIRPORTS } from "@/lib/pricing";
import { loadInstantDefaults, loadMasters } from "@/lib/pricingSettings";

/** Live booking catalog straight from the pricing engine — every city in
 *  the location list, its airport (+ terminals), and which sectors are on
 *  the rate chart. Deliberately NO amounts: prices are only released after
 *  the customer verifies an OTP (/api/booking). */
export async function GET() {
  const [m, instantDefaults] = await Promise.all([loadMasters(), loadInstantDefaults()]);
  const seen = new Set<string>();
  const cities = m.cities
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .map((c) => ({ name: c.name, ap: c.ap ?? null }));
  const airports = Object.fromEntries(
    [...new Set(cities.map((c) => c.ap).filter((x): x is string => !!x && !!AIRPORTS[x]))].map((code) => [code, AIRPORTS[code]]),
  );
  /* instant-booking rules per sector (dates, notice, limits — no prices), so
   * the form can say up front whether a date confirms instantly; the server
   * re-checks everything, including capacity, when the booking is made */
  const sectors = m.routes.map((r) => ({
    from: r.from, to: r.to, both: r.dir !== "one",
    instant: r.instant?.enabled ? { ...r.instant, minNoticeDays: r.instant.minNoticeDays ?? instantDefaults.minNoticeDays } : null,
  }));
  return NextResponse.json({ cities, airports, sectors, instantDefaults }, { headers: { "Cache-Control": "no-store" } });
}
