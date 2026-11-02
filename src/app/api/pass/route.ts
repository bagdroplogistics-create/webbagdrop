import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { readPassToken, trackPath } from "@/lib/trackLinks";
import { passView } from "@/lib/movePass";
import { pdf417, qr } from "@/lib/barcodes";
import { walletConfigured } from "@/lib/wallet";
import type { Booking } from "@/lib/types";

/** The Move Pass behind its signed link (/p/<token>): the pass data plus
 *  its QR (opens the live pass) and PDF417 (airline-grade 2D) as SVG.
 *  Private like a boarding pass — never cached, never indexed. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const t = u.searchParams.get("t") ?? "";
  const id = readPassToken(t);
  if (!id) return NextResponse.json({ error: "BAD_LINK" }, { status: 404 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  const p = b ? passView(b, Date.now()) : null;
  if (!b || !p) return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  const site = (process.env.SITE_URL || u.origin).replace(/\/$/, "");
  const passUrl = `${site}/p/${t}`;
  return NextResponse.json({
    pass: p, passUrl,
    qrSvg: qr(passUrl), pdf417Svg: pdf417(p.payload),
    trackUrl: !p.delivered ? trackPath(b.id) : null,
    wallet: walletConfigured(),
  }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
