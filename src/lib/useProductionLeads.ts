"use client";
/** Shared fetch for bagdrop.co/admin's real leads (src/app/api/admin/
 *  production-leads) — used by every admin module that needs the whole
 *  operation's picture, not just bagdrop-new's own bookings. One fetch
 *  pattern instead of copy-pasting it into each module. */
import { useEffect, useState } from "react";
import type { ProductionLead } from "@/app/api/admin/production-leads/route";

export function useProductionLeads(): { leads: ProductionLead[]; err: string | null } {
  const [leads, setLeads] = useState<ProductionLead[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    fetch("/api/admin/production-leads?limit=1000")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `HTTP_${r.status}`); return j as { leads: ProductionLead[] }; })
      .then((j) => { if (!dead) setLeads(j.leads); })
      .catch((e) => { if (!dead) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, []);

  return { leads, err };
}
