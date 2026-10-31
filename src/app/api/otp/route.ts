import { NextResponse } from "next/server";
import { issueOtp, checkOtp, cleanMobile, cleanEmail } from "@/lib/otp";
import { sendWhatsApp, sendEmail } from "@/lib/automation";
import { DEMO_ALLOWED } from "@/lib/demoMode";

/** Booking-time OTP — the customer confirms their mobile OR email before any
 *  money moves. Stateless (HMAC token, see src/lib/otp.ts), with a small
 *  in-memory throttle per destination. Without provider keys the code comes
 *  back in the response marked `demo` so localhost testing works end to end;
 *  with Meta WhatsApp / Resend configured the code is only ever sent out. */

const sends = new Map<string, number[]>(); // destination → send timestamps
const MAX_SENDS = 5, WINDOW_MS = 10 * 60 * 1000;

function throttled(to: string): boolean {
  const now = Date.now();
  const hist = (sends.get(to) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hist.length >= MAX_SENDS) { sends.set(to, hist); return true; }
  hist.push(now);
  sends.set(to, hist);
  if (sends.size > 5000) sends.clear(); // bounded memory
  return false;
}

type Body =
  | { action: "send"; channel: "mobile" | "email"; to: string }
  | { action: "verify"; to: string; code: string; exp: number; token: string };

export async function POST(req: Request) {
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  if (b.action === "send") {
    const to = b.channel === "email" ? cleanEmail(b.to) : cleanMobile(b.to);
    if (!to) return NextResponse.json({ error: b.channel === "email" ? "BAD_EMAIL" : "BAD_MOBILE" }, { status: 400 });
    if (throttled(to)) return NextResponse.json({ error: "TOO_MANY_REQUESTS", detail: "5 codes per 10 minutes — try again shortly." }, { status: 429 });

    const { code, exp, token } = issueOtp(to);
    const text = `${code} is your Bagdrop verification code. Valid 10 minutes — never share it.`;
    try {
      const res = b.channel === "email"
        ? await sendEmail(to, `${code} is your Bagdrop code`, text)
        : await sendWhatsApp(to, text);
      // stub mode (no provider keys yet) → hand the demo code back so the
      // flow still completes on localhost; with real keys `demo` is absent.
      // On a live deployment a stub send is a failure, never a free code.
      if (res.stub && !DEMO_ALLOWED) return NextResponse.json({ error: "OTP_NOT_CONFIGURED", detail: "We can't send codes right now — please WhatsApp or call us and we'll book you in." }, { status: 503 });
      return NextResponse.json({ ok: true, to, exp, token, ...(res.stub ? { demo: code } : {}) });
    } catch (e) {
      return NextResponse.json({ error: "SEND_FAILED", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  if (b.action === "verify") {
    const ok = checkOtp(b.to, b.code, Number(b.exp), b.token);
    if (!ok) return NextResponse.json({ error: "WRONG_OR_EXPIRED_CODE" }, { status: 401 });
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
