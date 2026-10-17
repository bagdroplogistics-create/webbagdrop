"use client";
import type { Masters } from "./pricing";
import type { City, RouteRate, Zone } from "./types";

export async function getMasters(): Promise<Masters> {
  const r = await fetch("/api/admin/pricing");
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j as Masters;
}

async function save(key: "routes" | "cities" | "rates" | "addons", value: unknown): Promise<Masters> {
  const r = await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j as Masters;
}

export const saveRoutes = (routes: RouteRate[]) => save("routes", routes);
export const saveExtraCities = (cities: City[]) => save("cities", cities);
export const saveMatrix = (matrix: Record<Zone, number[]>) => save("rates", matrix);
export const saveOversize = (oversize: number) => save("addons", { oversize });
