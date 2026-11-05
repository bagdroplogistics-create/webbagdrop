import { NextResponse } from "next/server";
import { issueOtp, checkOtpLimited, cleanMobile, cleanEmail } from "@/lib/otp";
import { sendWhatsAppOtp, sendEmail } from "@/lib/automation";
import { DEMO_ALLOWED } from "@/lib/demoMode";
import { serviceClient } from "@/lib/supabaseAdmin";

/** Booking-time OTP — the customer confirms their mobile OR email before any
 *  money moves. Stateless (HMAC token, see src/lib/otp.ts), with a small
 *  throttle per destination and per IP that holds across server instances
 *  (counters in the settings table). Without provider keys the code comes
 *  back in the response marked `demo` so localhost testing works end to end;
 *  with Meta WhatsApp / Resend configured the code is only ever sent out.
 *  If WhatsApp can't send, the code goes to the customer's email instead. */

/** Durable limits (serverless instances don't share memory): per number or
 *  email 5 codes / 10 minutes and 15 / day; per IP 100 / hour (a venue's
 *  Wi-Fi or a mobile carrier can put many guests behind one address). */
const LIMITS = [{ key: "10m", ms: 10 * 60_000, max: 5 }, { key: "day", ms: 86_400_000, max: 15 }];
async function overLimit(to: string, ip: string): Promise<boolean> {
  const sb = serviceClient();
  if (!sb) return false;
  const now = Date.now();
  const rows = [...LIMITS.filter((l) => ip !== "local" || l.key === "10m").map((l) => ({ id: `otpcount:${to}:${l.key}:${Math.floor(now / l.ms)}`, max: l.max })),
    ...(ip !== "local" ? [{ id: `otpcount:ip:${ip}:h:${Math.floor(now / 3_600_000)}`, max: 100 }] : [])]; // no client IP = a local test run
  const { data } = await sb.from("settings").select("id, doc").in("id", rows.map((r) => r.id));
  const n = new Map((data ?? []).map((r) => [r.id, (r.doc as { n?: number }).n ?? 0]));
  if (rows.some((r) => (n.get(r.id) ?? 0) >= r.max)) return true;
  await sb.from("settings").upsert(rows.map((r) => ({ id: r.id, doc: { n: (n.get(r.id) ?? 0) + 1 }, status: "otpfail", created: new Date().toISOString() })));
  return false;
}

/** Local testing only: OTP_SIMULATE_WA_DOWN=1 makes WhatsApp sends fail so the
 *  email fallback can be tried end to end. Ignored on a live deployment. */
const waDown = () => DEMO_ALLOWED && process.env.OTP_SIMULATE_WA_DOWN === "1";
const waReady = () => !!(process.env.META_WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
const emailReady = () => !!process.env.RESEND_API_KEY;

/** Issue a code for one destination and send it on one channel. A stub send
 *  (no provider keys) counts only on localhost, where the code comes back as
 *  `demo`; on a live deployment it is a failure, never a free code. */
async function tryChannel(channel: "mobile" | "email", to: string): Promise<{ ok: true; exp: number; token: string; demo?: string } | { ok: false; why: "not_configured" | "failed" }> {
  const { code, exp, token } = issueOtp(to);
  const text = `${code} is your Bagdrop verification code. Valid 10 minutes — never share it.`;
  try {
    if (channel === "mobile" && waDown()) throw new Error("WA_SIMULATED_DOWN");
    const res = channel === "email" ? await sendEmail(to, `${code} is your Bagdrop code`, text) : await sendWhatsAppOtp(to, code, text);
    if (res.stub && !DEMO_ALLOWED) return { ok: false, why: "not_configured" };
    return { ok: true, exp, token, ...(res.stub ? { demo: code } : {}) };
  } catch (e) {
    console.error(`OTP ${channel} send failed:`, e instanceof Error ? e.message : e); // provider details stay in the server log
    return { ok: false, why: "failed" };
  }
}

/** Which channels can deliver a code right now — the forms steer people to one that works. */
export async function GET() {
  return NextResponse.json({ mobile: !waDown() && (waReady() || DEMO_ALLOWED), email: emailReady() || DEMO_ALLOWED }, { headers: { "Cache-Control": "no-store" } });
}

type Body =
  | { action: "send"; channel: "mobile" | "email"; to: string; fallbackEmail?: string }
  | { action: "verify"; to: string; code: string; exp: number; token: string };

export async function POST(req: Request) {
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  if (b.action === "send") {
    const to = b.channel === "email" ? cleanEmail(b.to) : cleanMobile(b.to);
    if (!to) return NextResponse.json({ error: b.channel === "email" ? "BAD_EMAIL" : "BAD_MOBILE" }, { status: 400 });
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ip = !fwd || /^(::1|127\.|::ffff:127\.)/.test(fwd) ? "local" : fwd; // loopback = this machine (a local run)
    if (await overLimit(to, ip)) return NextResponse.json({ error: "TOO_MANY_REQUESTS", detail: "Too many codes requested — try again in a few minutes." }, { status: 429 });

    const first = await tryChannel(b.channel, to);
    if (first.ok) return NextResponse.json({ ok: true, channel: b.channel, to, exp: first.exp, token: first.token, ...(first.demo ? { demo: first.demo } : {}) });
    /* WhatsApp couldn't send: the code goes to the customer's email instead, when they gave one */
    const email = b.channel === "mobile" && b.fallbackEmail ? cleanEmail(b.fallbackEmail) : null;
    if (email && !(await overLimit(email, ip))) {
      const second = await tryChannel("email", email);
      if (second.ok) return NextResponse.json({ ok: true, channel: "email", fellBack: true, to: email, exp: second.exp, token: second.token, ...(second.demo ? { demo: second.demo } : {}) });
    }
    const detail = b.channel === "mobile"
      ? `We couldn't send a WhatsApp code right now. ${email ? "Email didn't work either — " : "Add your email and we'll send it there, or "}WhatsApp or call us on +91 63 5711 5711 and we'll book you in.`
      : "We couldn't send the email code right now. Try WhatsApp, or WhatsApp or call us on +91 63 5711 5711 and we'll book you in.";
    return NextResponse.json({ error: first.why === "not_configured" ? "OTP_NOT_CONFIGURED" : "SEND_FAILED", detail, canEmail: b.channel === "mobile" && !email }, { status: first.why === "not_configured" ? 503 : 502 });
  }

  if (b.action === "verify") {
    const ok = await checkOtpLimited(b.to, b.code, Number(b.exp), b.token);
    if (!ok) return NextResponse.json({ error: "WRONG_OR_EXPIRED_CODE" }, { status: 401 });
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
