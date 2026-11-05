/** The public origin customer-facing links (payment link SMS/WhatsApp/email,
 *  dashboard link, quote-pay page) must use — never the request's own origin,
 *  which on a basePath-prefixed deployment reverse-proxied onto bagdrop.co
 *  is the backend's raw *.vercel.app URL, not the public bagdrop.co address.
 *  Set SITE_URL (Production and Preview, no trailing slash) to the real
 *  public address for each deployment; falls back to the request's own
 *  origin only when SITE_URL isn't set (e.g. local dev). */
export function publicOrigin(req: Request): string {
  return (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
}
