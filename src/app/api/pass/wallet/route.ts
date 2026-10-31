import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { readPassToken } from "@/lib/trackLinks";
import { passView } from "@/lib/movePass";
import { buildPkpass, googleSaveUrl, walletConfigured } from "@/lib/wallet";
import type { Booking } from "@/lib/types";

/** Add the Move Pass to a phone wallet.
 *   ?t=<pass token>&kind=apple   → the signed .pkpass file
 *   ?t=<pass token>&kind=google  → redirect to "Save to Google Wallet"
 *  503 WALLET_NOT_CONFIGURED until the keys are set (see src/lib/wallet.ts). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const t = u.searchParams.get("t") ?? "";
  const kind = u.searchParams.get("kind");
  const id = readPassToken(t);
  if (!id || (kind !== "apple" && kind !== "google")) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  if (!walletConfigured()[kind]) return NextResponse.json({ error: "WALLET_NOT_CONFIGURED", detail: `${kind === "apple" ? "Apple" : "Google"} Wallet keys are not set up yet.` }, { status: 503 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  const p = b ? passView(b, Date.now()) : null;
  if (!p) return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  const site = (process.env.SITE_URL || u.origin).replace(/\/$/, "");
  const passUrl = `${site}/p/${t}`;
  try {
    if (kind === "google") return NextResponse.redirect(googleSaveUrl(p, passUrl, site), 302);
    const file = await buildPkpass(p, passUrl);
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": `attachment; filename="${p.ref}.pkpass"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error(`[wallet] ${kind} pass failed for ${id}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "WALLET_FAILED", detail: "The wallet pass couldn't be made — the web pass and PDF still work." }, { status: 500 });
  }
}
