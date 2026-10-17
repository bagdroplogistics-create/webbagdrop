/** Server-authoritative quoting. The browser previews; the figure signed HERE
 *  is the only one /api/pay will capture against. */
import { NextResponse } from "next/server";
import { quote } from "@/lib/pricing";
import { quotePayload, sign } from "@/lib/sign";
import type { Mode, SignedQuote } from "@/lib/types";

export async function POST(req: Request) {
  let body: { fromName?: string; toName?: string; bags?: number; oversize?: number; mode?: Mode; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const fromName = String(body.fromName ?? "");
  const toName = String(body.toName ?? "");
  const bags = Math.min(50, Math.max(0, Number(body.bags) || 0));
  const oversize = Math.min(20, Math.max(0, Number(body.oversize) || 0));
  if (!fromName || !toName) return NextResponse.json({ error: "MISSING_CITIES" }, { status: 400 });

  const q = quote({ fromName, toName, bags, oversize, mode: (body.mode ?? "road") as Mode, date: body.date });
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 200 });

  const qid = `QT-${Math.floor(Math.random() * 9000) + 1000}`;
  const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const signature = sign(quotePayload({ qid, fromName, toName, bags, oversize, total: q.total, validUntil }));
  const signed: SignedQuote = { ...q, qid, validUntil, signature };
  return NextResponse.json(signed);
}
