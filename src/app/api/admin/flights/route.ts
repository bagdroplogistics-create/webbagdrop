import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";

/** Live flight lookup — the one genuinely real part of the static build's
 *  Flights module (admin.js:1382-1407): a keyless public ADS-B API, called
 *  server-side here to avoid CORS/browser restrictions. Ported with the
 *  same failover chain. Everything else the original module had (the
 *  5-row fake "shipment flight board" and the delay-simulation button)
 *  was pure decoration with no real shipment↔flight linkage — dropped
 *  rather than ported as fake interactivity. */
const IATA2ICAO: Record<string, string> = {
  "6E": "IGO", AI: "AIC", UK: "VTI", EK: "UAE", QF: "QFA", SQ: "SIA", EY: "ETD",
  "9W": "JAI", SG: "SEJ", G8: "GOW", I5: "IAD", AK: "AXM", MH: "MAS", TG: "THA",
};

function toIcaoCallsign(input: string): string {
  const m = input.trim().toUpperCase().match(/^([A-Z0-9]{2})\s*0*(\d+)$/);
  if (!m) return input.trim().toUpperCase().replace(/\s+/g, "");
  const icao = IATA2ICAO[m[1]] ?? m[1];
  return `${icao}${m[2]}`;
}

interface AdsbAircraft { flight?: string; hex?: string; t?: string; r?: string; lat?: number; lon?: number; alt_baro?: number | "ground"; gs?: number; baro_rate?: number }

function phase(alt: number | "ground" | undefined, vs: number | undefined): string {
  if (alt === "ground" || alt === 0) return "on ground";
  const a = typeof alt === "number" ? alt : 0;
  if (a < 3000 && (vs ?? 0) < -300) return "landing";
  if ((vs ?? 0) < -300) return "descending";
  if ((vs ?? 0) > 300) return a < 10000 ? "departing" : "climbing";
  return "en route";
}

export async function GET(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const flight = new URL(req.url).searchParams.get("flight");
  if (!flight) return NextResponse.json({ error: "MISSING_FLIGHT" }, { status: 400 });
  const cs = toIcaoCallsign(flight);

  const sources = [
    `https://api.adsb.lol/v2/callsign/${cs}`,
    `https://api.airplanes.live/v2/callsign/${cs}`,
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const j = await r.json();
      const ac: AdsbAircraft | undefined = (j.ac ?? j.aircraft ?? [])[0];
      if (!ac) continue;
      return NextResponse.json({
        found: true, source: url, callsign: cs,
        reg: ac.r ?? null, type: ac.t ?? null,
        lat: ac.lat ?? null, lon: ac.lon ?? null,
        altitude: ac.alt_baro ?? null, groundSpeed: ac.gs ?? null,
        phase: phase(ac.alt_baro, ac.baro_rate),
      });
    } catch {
      continue;
    }
  }
  return NextResponse.json({ found: false, callsign: cs });
}
