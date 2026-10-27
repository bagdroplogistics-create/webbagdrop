import { createClient } from "@supabase/supabase-js";

/** Read-only connection to the PRODUCTION Supabase project (bagdrop.co/admin's
 *  database) — entirely separate from this app's own Supabase project
 *  (NEXT_PUBLIC_SUPABASE_URL above), which stays untouched for bagdrop-new's
 *  own booking flow. Only ever import this from a server file under
 *  src/app/api/admin/*, gated by isAdminRequest(). Never import from a
 *  "use client" file — PROD_SUPABASE_SERVICE_ROLE_KEY must never reach the
 *  browser. Every query here is explicitly .select()-only in the route
 *  handlers that use this client; nothing in this app writes to production. */
export function prodClient() {
  const url = process.env.PROD_SUPABASE_URL;
  const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
