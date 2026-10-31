"use client";
/** Which backend the browser-side helpers talk to: Supabase when
 *  NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY are set, localStorage demo otherwise.
 *
 *  The browser never reads or writes the `bookings` table, and no longer
 *  calls the old anon RPCs (create_booking, get_booking,
 *  update_booking_customer) either — those are revoked from anon in
 *  supabase/migration_003_lockdown.sql. Customer writes go through the
 *  server routes (/api/booking, /api/account, /api/kyc, /api/wedding/*);
 *  admin goes through /api/admin behind the session cookie
 *  (src/lib/adminAuth.ts).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const backend: "supabase" | "local" = url && key ? "supabase" : "local";

export const nowIso = () => new Date().toISOString();
