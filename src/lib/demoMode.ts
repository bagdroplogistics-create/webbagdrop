/** Demo shortcuts — OTP codes echoed back to the browser when no WhatsApp /
 *  email provider is configured, and the fixed Aadhaar demo code used until a
 *  licensed eSign provider (ESP) is connected — exist so localhost can run
 *  the whole flow. On a Vercel deployment (production OR preview) they are
 *  OFF, so a live site can never hand out its own codes or accept 112233.
 *  A preview that genuinely needs them sets ALLOW_DEMO_CODES=1 for that
 *  environment only. Server-only. */
export const DEMO_ALLOWED = !process.env.VERCEL || process.env.ALLOW_DEMO_CODES === "1";
