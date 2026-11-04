import { NextResponse } from "next/server";
import { createDigilockerRequest, digilockerConfigured } from "@/lib/setu";

/** TEMPORARY — validates the Setu DigiLocker sandbox credentials/request shape
 *  without needing a real paid booking. Delete before merging to main. */
export async function GET() {
  if (!digilockerConfigured()) return NextResponse.json({ configured: false });
  try {
    const req = await createDigilockerRequest("https://example.com/dg-callback");
    return NextResponse.json({ configured: true, ok: true, id: req.id, url: req.url, validUpto: req.validUpto });
  } catch (e) {
    return NextResponse.json({ configured: true, ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
