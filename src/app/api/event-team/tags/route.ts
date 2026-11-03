import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { eventMobileFromCookie, eventsForMobile } from "@/lib/eventTeamAuth";
import { tagSheet } from "@/lib/weddingTagSheet";

/** The event company prints its own event's bag tags (same sheet as BAGDROP OS). */
export async function GET(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const mobile = eventMobileFromCookie(req.headers.get("cookie"));
  const events = mobile ? await eventsForMobile(sb, mobile) : [];
  if (!mobile || !events.length) return NextResponse.json({ error: "SIGNED_OUT" }, { status: 401 });
  return tagSheet(sb, req.url, events);
}
