import { NextResponse } from "next/server";

/** Retired: identity is now verified only by signing the indemnity bond
 *  (/api/kyc), so a guest can never be verified without the declarations.
 *  Kept as a stub so old clients get a clear answer instead of a 404. */
const gone = () => NextResponse.json({ error: "MOVED", detail: "Identity verification moved to /api/kyc (indemnity bond)." }, { status: 410 });
export const GET = gone;
export const POST = gone;
