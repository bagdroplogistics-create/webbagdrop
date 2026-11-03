/** Which airport(s) serve a city, for the airport end of Home → Airport,
 *  Airport → Home and Hotel → Airport bookings. A city has a main airport
 *  (`ap`) and may have more (`aps`, e.g. Mumbai: BOM and NMI); the main one
 *  is offered first. Codes the built-in list doesn't know (a city the team
 *  added) still work, named after the city. */
import { AIRPORTS, CITIES } from "./pricing";
import { SERVICES } from "./services";
import type { UseCase } from "./types";

export type AirportInfo = { name: string; terminals?: string[] };

export const cityAirportCodes = (c?: { ap?: string | null; aps?: string[] | null } | null): string[] =>
  [...new Set([c?.ap, ...(c?.aps ?? [])].map((x) => (x ?? "").trim().toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)))];

export const airportInfo = (code: string, city: string): AirportInfo => AIRPORTS[code] ?? { name: `${city} Airport (${code})` };

export const airportLabel = (a: AirportInfo, terminal?: string) => `${a.name}${terminal ? ` · ${terminal}` : ""}`;

/** "from" when bags are picked up at the airport, "to" when delivered there, else null. */
export const airportEnd = (uc: UseCase | string | undefined) => SERVICES.find((s) => s.uc === uc)?.airportEnd ?? null;

/** Server side: an air booking whose airport end came in blank gets the
 *  city's main airport, so the pickup or delivery never reads empty. */
export function withAirportAddress(uc: UseCase | string | undefined, from: string, to: string, pickAddr: string, dropAddr: string, cities: { name: string; ap?: string | null; aps?: string[] }[] = CITIES) {
  const end = airportEnd(uc);
  const main = (city: string) => {
    const c = cities.find((x) => x.name.toLowerCase() === city.trim().toLowerCase());
    const code = cityAirportCodes(c)[0];
    return c && code ? airportInfo(code, c.name).name : "";
  };
  return {
    pickAddr: end === "from" && !pickAddr.trim() ? main(from) : pickAddr,
    dropAddr: end === "to" && !dropAddr.trim() ? main(to) : dropAddr,
  };
}
