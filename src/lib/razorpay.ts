/** Razorpay scaffold — fully wired code paths that activate the moment the
 *  keys land in the environment; until then /api/pay stays in demo capture
 *  and says so. Server-only. */
import crypto from "crypto";

export const razorpayConfigured = () => !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

export async function createOrder(amountInr: number, receipt: string): Promise<{ orderId: string; keyId: string; amount: number }> {
  const id = process.env.RAZORPAY_KEY_ID!, secret = process.env.RAZORPAY_KEY_SECRET!;
  const r = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: "INR", receipt, payment_capture: 1 }),
  });
  if (!r.ok) throw new Error(`RAZORPAY_${r.status}:${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { id: string; amount: number };
  return { orderId: j.id, keyId: id, amount: j.amount };
}

/** Webhook signature check — HMAC-SHA256 of the raw body with the webhook
 *  secret, timing-safe compare. An unverified payload never touches state. */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expect = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expect), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
