"use client";
/** Admin OS · Flights — ported from the static build's m-flt module
 *  (admin.html:562-630, admin.js:1382-1496). The live ADS-B lookup is
 *  genuinely real (a keyless public flight-tracking API, proxied
 *  server-side — see src/app/api/admin/flights). The original's 5-row
 *  "shipment flight board" and delay-simulation button were pure
 *  decoration (static HTML, no real shipment↔flight link) — dropped
 *  rather than faked; the air-mode bookings list below is the real
 *  equivalent, derived from live bookings instead. */
import { useEffect, useState } from "react";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking } from "@/lib/types";
import { useProductionLeads } from "@/lib/useProductionLeads";
import { Badge, Button, Card, Input } from "@/components/ui";

interface FlightResult {
  found: boolean; callsign: string; source?: string; reg?: string | null; type?: string | null;
  lat?: number | null; lon?: number | null; altitude?: number | string | null; groundSpeed?: number | null; phase?: string;
}

export default function Flights() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  const airBookings = bookings.filter((b) => b.mode === "air" && b.ref);
  const { leads: prodLeads } = useProductionLeads();
  const prodAirLeads = prodLeads.filter((l) => l.flightNumber);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<FlightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState("");

  async function lookup() {
    if (!query.trim()) return;
    setBusy(true); setLookupErr(""); setResult(null);
    try {
      const r = await fetch(`/api/admin/flights?flight=${encodeURIComponent(query)}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? "Lookup failed");
      setResult(j as FlightResult);
    } catch (e) { setLookupErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">Live flight lookup <Badge tone="ok">live ADS-B feed</Badge></h3>
        <div className="mb-3 flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="6E 5219" onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }} />
          <Button disabled={busy} onClick={() => void lookup()}>{busy ? "Looking up…" : "Track"}</Button>
        </div>
        {lookupErr && <p className="text-sm text-red-700">{lookupErr}</p>}
        {result && !result.found && <p className="text-sm text-muted">No live position found for {result.callsign} — likely not currently airborne, or outside ADS-B coverage.</p>}
        {result?.found && (
          <div className="rounded-xl bg-paper p-3 text-sm">
            <p><b>{result.callsign}</b> {result.reg ? `· ${result.reg}` : ""} {result.type ? `· ${result.type}` : ""}</p>
            <p className="text-xs text-muted">
              Phase: <Badge tone="info">{result.phase}</Badge> · Altitude {result.altitude === "ground" ? "ground" : `${result.altitude ?? "—"} ft`} · Ground speed {result.groundSpeed ?? "—"} kt
            </p>
            {result.lat != null && result.lon != null && <p className="text-xs text-faint">{result.lat.toFixed(3)}, {result.lon.toFixed(3)}</p>}
          </div>
        )}
        <p className="mt-2 text-[11px] text-faint">Keyless public ADS-B data (adsb.lol / airplanes.live) — coverage and accuracy aren&apos;t guaranteed.</p>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-sm font-bold">
          Bookings on an air mode <Badge tone="ok">live</Badge> <span className="font-normal text-faint">+ {prodAirLeads.length} from bagdrop.co</span>
        </h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-2 pr-2">Booking</th><th className="pr-2">Flight</th><th className="pr-2">Route</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {airBookings.length === 0 && prodAirLeads.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">No air-mode bookings yet.</td></tr>}
            {airBookings.map((b) => (
              <tr key={b.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                <td className="pr-2 font-mono text-xs">{b.ref || "—"}</td>
                <td className="pr-2 text-xs">{b.from} → {b.to}</td>
                <td className="text-xs text-muted">{b.date}</td>
              </tr>
            ))}
            {prodAirLeads.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 font-mono text-xs">{l.leadNumber ?? l.id.slice(0, 8)}</td>
                <td className="pr-2 font-mono text-xs">{l.flightNumber}</td>
                <td className="pr-2 text-xs">{l.fromCity ?? "—"} → {l.toCity ?? "—"}</td>
                <td className="text-xs text-muted">{l.pickupDate ?? l.travelDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
