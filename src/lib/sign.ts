/** Quote signing — server-only (node:crypto keeps this out of client bundles). The same payload format is produced at quote
 *  time and re-checked at payment time; if any figure changed in the browser,
 *  the signature no longer matches and the capture is refused. */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.QUOTE_SIGNING_SECRET ?? "dev-secret-change-me";

export function quotePayload(args: {
  qid: string; fromName: string; toName: string;
  bags: number; oversize: number; total: number; validUntil: string;
}): string {
  return [args.qid, args.fromName, args.toName, args.bags, args.oversize, args.total, args.validUntil].join("|");
}

export function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function verify(payload: string, signature: string): boolean {
  const a = Buffer.from(sign(payload), "hex");
  const b = Buffer.from(signature || "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
