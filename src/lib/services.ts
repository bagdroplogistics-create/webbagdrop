/** The bookable services — one list shared by the booking form and the
 *  server, so the server never trusts a mode or title sent by a browser. */
import type { Mode, UseCase } from "./types";

export const SERVICES: { uc: UseCase; mode: Mode; title: string; sub: string; airportEnd: "from" | "to" | null }[] = [
  { uc: "d2a", mode: "air", title: "Home → Airport", sub: "Bags reach the airport before you do", airportEnd: "to" },
  { uc: "a2d", mode: "air", title: "Airport → Home", sub: "Land and leave, we bring them home", airportEnd: "from" },
  { uc: "h2a", mode: "air", title: "Hotel → Airport", sub: "Check out light", airportEnd: "to" },
  { uc: "h2h", mode: "road", title: "Hotel → Hotel", sub: "Next city, same bags", airportEnd: null },
  { uc: "d2d", mode: "road", title: "Door → Door", sub: "City to city, by road", airportEnd: null },
  { uc: "rail", mode: "rail", title: "Railway station", sub: "Vande Bharat, Rajdhani", airportEnd: null },
  { uc: "cruise", mode: "sea", title: "Cruise terminal", sub: "Mumbai, Goa, Kochi sailings", airportEnd: null },
];

/** Today's date in India (bookings run on IST, not the server's clock). */
export const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
export const istTomorrow = () => new Date(Date.now() + 5.5 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);
