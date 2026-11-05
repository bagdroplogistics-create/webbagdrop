import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient, newToken } from "@/lib/supabaseAdmin";
import { DEFAULT_COST_MODEL, type CostModel, type Vendor, type Captain, type Hub, type VehicleRec } from "@/lib/opsModel";

/** Operations masters: the vendor list and the per-lane cost model, both
 *  settings-table docs — same storage pattern as the pricing masters.
 *  Per-shipment ops state lives on the booking document itself and goes
 *  through /api/admin/bookings. */

async function readMasters() {
  const sb = serviceClient();
  if (!sb) return null;
  const { data, error } = await sb.from("settings").select("id, doc").in("id", ["vendors", "costmodel", "hubs", "vehicles", "captains"]);
  if (error) throw new Error(error.message);
  const byId: Record<string, unknown> = {};
  (data ?? []).forEach((r) => { byId[r.id] = r.doc; });
  return {
    vendors: ((byId.vendors as { vendors?: Vendor[] })?.vendors ?? []) as Vendor[],
    costModel: ((byId.costmodel as { model?: CostModel })?.model ?? DEFAULT_COST_MODEL) as CostModel,
    hubs: ((byId.hubs as { hubs?: Hub[] })?.hubs ?? []) as Hub[],
    vehicles: ((byId.vehicles as { vehicles?: VehicleRec[] })?.vehicles ?? []) as VehicleRec[],
    captains: ((byId.captains as { captains?: Captain[] })?.captains ?? []) as Captain[],
  };
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const m = await readMasters();
    if (!m) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    return NextResponse.json(m);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "READ_FAILED" }, { status: 500 });
  }
}

type Body =
  | { action: "saveVendor"; vendor: Omit<Vendor, "id"> & { id?: string } }
  | { action: "deleteVendor"; id: string }
  | { action: "scoreVendor"; id: string; onTime: boolean }
  | { action: "saveCostModel"; model: CostModel }
  | { action: "saveHub"; hub: Omit<Hub, "id"> & { id?: string } } | { action: "deleteHub"; id: string }
  | { action: "saveVehicle"; vehicle: Omit<VehicleRec, "id"> & { id?: string } } | { action: "deleteVehicle"; id: string }
  | { action: "saveCaptain"; captain: Omit<Captain, "id"> & { id?: string } } | { action: "deleteCaptain"; id: string };

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const m = await readMasters();
  if (!m) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  /* the in-house masters: one settings doc each */
  const master = async <T extends { id: string }>(key: "hubs" | "vehicles" | "captains", list: T[], next: (list: T[]) => T[]) => {
    const out = next(list);
    const { error } = await sb.from("settings").upsert({ id: key, doc: { [key]: out }, status: null, created: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, [key]: out });
  };
  const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (b.action === "saveHub") { const h = b.hub; if (!h.city?.trim() || !h.name?.trim()) return NextResponse.json({ error: "MISSING_FIELDS", detail: "City and hub name are needed." }, { status: 400 }); const v = { ...h, id: h.id ?? newId("HUB") } as Hub; return master("hubs", m.hubs, (l) => [...l.filter((x) => x.id !== v.id), v]); }
  if (b.action === "deleteHub") return master("hubs", m.hubs, (l) => l.filter((x) => x.id !== b.id));
  if (b.action === "saveVehicle") { const h = b.vehicle; if (!h.number?.trim()) return NextResponse.json({ error: "MISSING_FIELDS", detail: "Vehicle number is needed." }, { status: 400 }); const v = { ...h, number: h.number.trim().toUpperCase(), id: h.id ?? newId("VEH") } as VehicleRec; return master("vehicles", m.vehicles, (l) => [...l.filter((x) => x.id !== v.id), v]); }
  if (b.action === "deleteVehicle") return master("vehicles", m.vehicles, (l) => l.filter((x) => x.id !== b.id));
  if (b.action === "saveCaptain") { const h = b.captain; if (!h.name?.trim() || (h.mobile ?? "").replace(/\D/g, "").length < 10) return NextResponse.json({ error: "MISSING_FIELDS", detail: "Name and a 10-digit mobile are needed." }, { status: 400 }); const v = { ...h, id: h.id ?? newId("CAP") } as Captain; return master("captains", m.captains, (l) => [...l.filter((x) => x.id !== v.id), v]); }
  if (b.action === "deleteCaptain") return master("captains", m.captains, (l) => l.filter((x) => x.id !== b.id));

  if (b.action === "saveCostModel") {
    if (!b.model?.defaults) return NextResponse.json({ error: "BAD_MODEL" }, { status: 400 });
    const { error } = await sb.from("settings").upsert({ id: "costmodel", doc: { model: b.model }, status: null, created: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, costModel: b.model });
  }

  let vendors = m.vendors;
  if (b.action === "saveVendor") {
    if (!b.vendor?.name || !b.vendor?.mobile) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const v: Vendor = { jobs: 0, onTime: 0, ...b.vendor, id: b.vendor.id ?? newToken("V", 6) };
    vendors = [...vendors.filter((x) => x.id !== v.id), v];
  } else if (b.action === "deleteVendor") {
    vendors = vendors.filter((x) => x.id !== b.id);
  } else if (b.action === "scoreVendor") {
    vendors = vendors.map((x) => x.id === b.id ? { ...x, jobs: (x.jobs ?? 0) + 1, onTime: (x.onTime ?? 0) + (b.onTime ? 1 : 0) } : x);
  } else {
    return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  }

  const { error } = await sb.from("settings").upsert({ id: "vendors", doc: { vendors }, status: null, created: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vendors });
}
