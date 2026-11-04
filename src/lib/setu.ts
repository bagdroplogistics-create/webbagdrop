/** Setu DigiLocker — real Aadhaar e-KYC for the domestic bond-signing step,
 *  replacing the fixed 112233 demo code. The customer is redirected to
 *  DigiLocker's own government-hosted login (their Aadhaar-linked mobile
 *  OTP, not ours), consents to share Aadhaar, and is sent back to us; we
 *  then pull the verified data straight from DigiLocker.
 *
 *  A no-op (digilockerConfigured() === false) until SETU_DG_CLIENT_ID,
 *  SETU_DG_CLIENT_SECRET and SETU_DG_PRODUCT_INSTANCE_ID are all set — the
 *  domestic step falls back to the demo code until then. SETU_DG_BASE_URL
 *  defaults to Setu's sandbox; set it to https://dg.setu.co once Setu
 *  approves the merchant for production ("Submit to go live"). */

const BASE = (process.env.SETU_DG_BASE_URL || "https://dg-sandbox.setu.co").replace(/\/$/, "");

function authHeaders(): Record<string, string> | null {
  const clientId = process.env.SETU_DG_CLIENT_ID;
  const clientSecret = process.env.SETU_DG_CLIENT_SECRET;
  const productInstanceId = process.env.SETU_DG_PRODUCT_INSTANCE_ID;
  if (!clientId || !clientSecret || !productInstanceId) return null;
  return { "x-client-id": clientId, "x-client-secret": clientSecret, "x-product-instance-id": productInstanceId };
}

export const digilockerConfigured = (): boolean => !!authHeaders();

export interface DigilockerRequest { id: string; status: string; url: string; validUpto: string }
export interface DigilockerStatus { id: string; status: "unauthenticated" | "authenticated" | "revoked" | string; url?: string; digilockerUserDetails?: { digilockerId?: string; email?: string; phoneNumber?: string } }
export interface DigilockerAadhaar {
  name: string; dateOfBirth: string; gender: string; address: string; phone?: string; email?: string;
  maskedNumber: string; photo?: string; verified: boolean; generatedAt: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const h = authHeaders();
  if (!h) throw new Error("DIGILOCKER_NOT_CONFIGURED");
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...h, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`SETU_DG_${r.status}:${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

/** Step 1: create the request. redirectUrl must be publicly reachable —
 *  DigiLocker sends the browser back there with ?success=&id=&scope= */
export function createDigilockerRequest(redirectUrl: string): Promise<DigilockerRequest> {
  return call<DigilockerRequest>("/api/digilocker/", { method: "POST", body: JSON.stringify({ redirectUrl }) });
}

/** Step 2 (optional poll — the redirect's own ?success= is usually enough) */
export function getDigilockerStatus(id: string): Promise<DigilockerStatus> {
  return call<DigilockerStatus>(`/api/digilocker/${id}/status`);
}

/** Step 3: once back with success=True and scope containing ADHAR, pull the
 *  verified Aadhaar data straight from DigiLocker. */
export async function getDigilockerAadhaar(id: string): Promise<DigilockerAadhaar> {
  const j = await call<{ id: string; status: string; aadhaar: DigilockerAadhaar }>(`/api/digilocker/${id}/aadhaar`);
  return j.aadhaar;
}

/** Revoke a request once its data is no longer needed (after a completed or
 *  abandoned verification) — DigiLocker access for that request id ends. */
export async function revokeDigilockerRequest(id: string): Promise<void> {
  await call(`/api/digilocker/${id}/revoke`);
}
