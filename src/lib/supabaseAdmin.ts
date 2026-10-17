import { createClient } from "@supabase/supabase-js";

/** The SERVICE ROLE client — full read/write, bypasses every RLS policy.
 *  Only ever import this from a server file under src/app/api/admin/*,
 *  each of which is gated by isAdminRequest() (src/lib/adminAuth.ts) before
 *  this is ever reached. Never import from a "use client" file. */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const ID_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L

/** Same unguessable-token shape as the database's gen_booking_id() —
 *  used when the admin app creates a row itself (service role, no RPC). */
export function newToken(prefix: string, len = 10): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return `${prefix}-${new Date().getFullYear()}-${s}`;
}
