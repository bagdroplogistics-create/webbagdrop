"use client";
/** The airport end of an air booking: the airport(s) serving the chosen city
 *  (a choice when there is more than one) and the terminal where the
 *  airport has several. Hands the parent the address line to save, e.g.
 *  "Mumbai — Chhatrapati Shivaji Maharaj Intl (BOM) · Terminal 2".
 *  `initial` (the quote desk, editing a saved booking) preselects the saved
 *  airport and terminal; a saved line that matches no option is left as it
 *  is until staff pick something. */
import { useEffect, useRef, useState } from "react";
import { airportLabel, type AirportInfo } from "@/lib/airports";
import { Field, Select } from "@/components/ui";

export default function AirportPicker({ label, city, codes, airports, onAddress, initial }: {
  label: string; city: string; codes: string[]; airports: Record<string, AirportInfo>; onAddress: (address: string) => void; initial?: string;
}) {
  const [pick, setPick] = useState(() => {
    for (const code of codes) {
      const ap = airports[code];
      for (const terminal of ["", ...(ap?.terminals ?? [])]) if (ap && initial && airportLabel(ap, terminal) === initial) return { city, code, terminal };
    }
    return { city, code: codes[0] ?? "", terminal: "" };
  });
  /* a saved address that matches no option stays untouched until staff choose */
  const [touched, setTouched] = useState(false);
  const keep = !!initial && !touched;
  const cur = pick.city === city && codes.includes(pick.code) ? pick : { city, code: codes[0] ?? "", terminal: "" };
  const a = airports[cur.code];
  const address = a ? airportLabel(a, cur.terminal) : "";
  const report = useRef(onAddress);
  useEffect(() => { report.current = onAddress; });
  useEffect(() => { if (address && !(keep && address !== initial)) report.current(address); }, [address, keep, initial]);
  if (!a) return null;
  return (
    <Field label={label}>
      {codes.length > 1 ? (
        <Select value={cur.code} onChange={(e) => { setTouched(true); setPick({ city, code: e.target.value, terminal: "" }); }}>
          {codes.map((c) => <option key={c} value={c}>{airports[c]?.name ?? c}</option>)}
        </Select>
      ) : (
        <div className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm">{a.name}</div>
      )}
      {a.terminals?.length ? (
        <Select className="mt-1.5" value={cur.terminal} onChange={(e) => { setTouched(true); setPick({ city, code: cur.code, terminal: e.target.value }); }}>
          <option value="">Terminal (if known)</option>
          {a.terminals.map((t) => <option key={t}>{t}</option>)}
        </Select>
      ) : null}
    </Field>
  );
}
