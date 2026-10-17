/** Loads the EFFECTIVE pricing masters (defaults merged with whatever the
 *  Pricing engine admin module has persisted) — server-only, used by
 *  /api/quote and /api/admin/quotes so a real customer quote reflects any
 *  rate-chart edits. Reads via the service role (same as every other
 *  /api/admin/* route) since there's no customer-facing reason for the
 *  browser to read these directly — the client preview in Wizard.tsx uses
 *  the static DEFAULT_MASTERS, which is why the signed server quote is
 *  always the figure that's actually charged. */
import { DEFAULT_MASTERS, type Masters } from "./pricing";
import { serviceClient } from "./supabaseAdmin";
import type { City, RouteRate, Zone } from "./types";

interface SettingsRow { routes?: RouteRate[]; cities?: City[]; matrix?: Record<Zone, number[]>; oversize?: number }

export async function loadMasters(): Promise<Masters> {
  const sb = serviceClient();
  if (!sb) return DEFAULT_MASTERS;

  const { data } = await sb.from("settings").select("id, doc").in("id", ["routes", "cities", "rates", "addons"]);
  const byId: Record<string, SettingsRow | undefined> = {};
  (data ?? []).forEach((r) => { byId[r.id] = r.doc as SettingsRow; });

  return {
    routes: byId.routes?.routes ?? DEFAULT_MASTERS.routes,
    cities: [...DEFAULT_MASTERS.cities, ...(byId.cities?.cities ?? [])],
    matrix: byId.rates?.matrix ?? DEFAULT_MASTERS.matrix,
    oversizeRate: byId.addons?.oversize ?? DEFAULT_MASTERS.oversizeRate,
  };
}
