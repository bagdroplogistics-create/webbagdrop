"use client";
/** BAGDROP OS · Pricing engine client — every price change goes through
 *  /api/admin/pricing (draft → publish, versioned, validated). */
import type { Masters } from "./pricing";
import type { CostModel } from "./opsModel";
import type { Issue } from "./pricingRules";
import type { Benchmark, DraftCard, LogEntry } from "./pricingSettings";
import type { InstantDefaults } from "./instant";
import type { RouteRate } from "./types";

export interface PricingState {
  live: { routes: RouteRate[]; version: number; publishedAt: string | null; note: string | null; by: string | null; instantDefaults: InstantDefaults; rev: number | null };
  draft: DraftCard | null; draftRev: number | null;
  log: LogEntry[];
  benchmarks: Record<string, Benchmark>;
  masters: Masters; costModel: CostModel; selfTest: string[];
}
export type ApiResult = { ok: boolean; status: number; error?: string; detail?: string; issues?: Issue[]; version?: number };

export async function getPricing(): Promise<PricingState> {
  const r = await fetch("/api/admin/pricing", { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
  return j as PricingState;
}

export async function pricingAction(action: string, body: Record<string, unknown> = {}): Promise<ApiResult> {
  const r = await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j.error, status: r.status, ...j };
}

export async function saveCostModel(model: CostModel): Promise<boolean> {
  const r = await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveCostModel", model }) });
  return r.ok;
}
