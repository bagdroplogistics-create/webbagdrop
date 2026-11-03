import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { checkOtpLimited } from "@/lib/otp";
import { claimOnce } from "@/lib/automation";
import { EVENT_COOKIE, eventCookieOptions, eventMobileFromCookie, eventsForMobile, makeEventToken, personFor } from "@/lib/eventTeamAuth";
import { eventBookings, weddingAction, type OpsBody } from "@/lib/weddingOpsHandler";
import { teamView } from "@/lib/weddingTeamView";
import { bookingOpen, closesText } from "@/lib/weddingStatus";

/** The event company portal (/event).
 *   POST {action:"login", otp:{to,code,exp,token}} — a WhatsApp code to a mobile
 *        listed on an event (event.team.mobiles); {action:"logout"}
 *   GET  → the company's events and every family booking on them (TeamFamily)
 *   POST any wedding desk action (setRoom, setBagRoom, acceptReturn, reply,
 *        rooming) — limited to the company's own events. It cannot approve,
 *        price or cancel bookings; that stays in BAGDROP OS. */

export async function GET(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const mobile = eventMobileFromCookie(req.headers.get("cookie"));
  const events = mobile ? await eventsForMobile(sb, mobile) : [];
  if (!mobile || !events.length) return NextResponse.json({ error: "SIGNED_OUT" }, { status: 401 });
  const families = (await Promise.all(events.map((e) => eventBookings(sb, e.id)))).flat()
    .sort((a, b) => b.created.localeCompare(a.created)).map(teamView);
  return NextResponse.json({
    company: events[0].team?.company ?? "Event team",
    person: personFor(events, mobile),
    who: `+91 ${mobile.slice(-10, -5)} ${mobile.slice(-5)}`,
    events: events.map((e) => ({ id: e.id, name: e.name, venue: e.venue || e.venueCity, dates: e.dates, open: e.status === "open" && bookingOpen(e), closes: closesText(e), page: e.page ?? "" })),
    families,
  });
}

export async function POST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let body: OpsBody & { otp?: { to?: string; code?: string; exp?: number; token?: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  if (body.action === "login") {
    const o = body.otp ?? {};
    if (!o.to || !o.code || !o.exp || !o.token || !(await checkOtpLimited(o.to, o.code, Number(o.exp), o.token))) return NextResponse.json({ error: "OTP_INVALID" }, { status: 401 });
    if (!(await eventsForMobile(sb, o.to)).length) return NextResponse.json({ error: "NOT_ON_TEAM", detail: "This mobile is not on any event team. Ask Bagdrop to add it." }, { status: 403 });
    if (!(await claimOnce(`otpuse:event:${o.token.slice(0, 40)}`))) return NextResponse.json({ error: "OTP_USED" }, { status: 409 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(EVENT_COOKIE, makeEventToken(o.to), eventCookieOptions);
    return res;
  }
  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(EVENT_COOKIE, "", { ...eventCookieOptions, maxAge: 0 });
    return res;
  }

  const mobile = eventMobileFromCookie(req.headers.get("cookie"));
  const events = mobile ? await eventsForMobile(sb, mobile) : [];
  if (!mobile || !events.length) return NextResponse.json({ error: "SIGNED_OUT" }, { status: 401 });
  return weddingAction(sb, { kind: "event", name: events[0].team?.company ?? "Event team", person: personFor(events, mobile) }, body, events);
}
