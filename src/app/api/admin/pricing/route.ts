import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { loadMasters } from "@/lib/pricingSettings";
import type { City, RouteRate, Zone } from "@/lib/types";

/** GET returns the EFFECTIVE masters (defaults merged with whatever's
 *  persisted) — the admin Pricing engine edits this directly and saves
 *  the whole array/object back, same pattern as the static build's
 *  per-cell-save route chart. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const masters = await loadMasters();
  return NextResponse.json(masters);
}

type SaveBody =
  | { key: "routes"; value: RouteRate[] }
  | { key: "cities"; value: City[] }
  | { key: "rates"; value: Record<Zone, number[]> }
  | { key: "addons"; value: { oversize: number } };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: SaveBody;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.key || b.value === undefined) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const docKey = b.key === "rates" ? "matrix" : b.key === "cities" ? "cities" : b.key === "addons" ? "oversize" : "routes";
  const doc = { [docKey]: b.key === "addons" ? (b.value as { oversize: number }).oversize : b.value };
  const { error } = await sb.from("settings").upsert({ id: b.key, doc, status: null, created: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const masters = await loadMasters();
  return NextResponse.json(masters);
}
