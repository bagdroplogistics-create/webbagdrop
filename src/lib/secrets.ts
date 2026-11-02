/** Server secrets that sign sessions, OTP codes, quotes and tracking links.
 *  On localhost a missing secret falls back to a dev value so the app runs;
 *  on Vercel (production or preview) a missing or short secret stops the
 *  request instead — a known fallback would let anyone forge sessions. */
export function requiredSecret(name: "ADMIN_SECRET_KEY" | "QUOTE_SIGNING_SECRET", devFallback: string): string {
  const v = process.env[name];
  if (v && v.length >= 12) return v;
  if (process.env.VERCEL) throw new Error(`${name} is missing or shorter than 12 characters — set it in the Vercel project settings.`);
  return v || devFallback;
}
