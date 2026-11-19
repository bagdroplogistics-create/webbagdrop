import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { loadWaConfig, saveWaConfig } from "@/lib/waConfig";
import type { WaConfig } from "@/lib/waTypes";

/** Chatbot Settings (section B) — one GET/PATCH pair over the single
 *  `settings` row "wa:config", same shape as RulesAndNotifications.tsx's
 *  own settings screens elsewhere in the admin. */

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const cfg = await loadWaConfig();
  return NextResponse.json({ ok: true, config: cfg });
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let patch: Partial<WaConfig>;
  try { patch = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  try {
    const cfg = await saveWaConfig(patch);
    return NextResponse.json({ ok: true, config: cfg });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "SAVE_FAILED" }, { status: 500 });
  }
}
