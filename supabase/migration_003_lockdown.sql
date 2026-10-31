-- MIGRATION 003 · LOCK DOWN THE OLD ANON BOOKING RPCs (2026-10-30)
--
-- Booking flow v2 moved every customer read/write onto server routes that
-- use the service role behind their own guards (/api/booking, /api/account,
-- /api/kyc, /api/wedding/*). The three SECURITY DEFINER functions the old
-- browser code called with the anon key are now unused, and get_booking in
-- particular returns a whole booking (name, mobile, address, payment) to
-- anyone holding an id. Take them away from anon/authenticated; the service
-- role keeps everything.
--
-- ORDER MATTERS ON PRODUCTION: the code live on www.bagdrop.co before the v2
-- deploy still calls these from the browser. Run this on production ONLY
-- AFTER the v2 code is deployed there, or live bookings break.
--
-- Safe to run more than once.

revoke execute on function create_booking(jsonb)                   from public, anon, authenticated;
revoke execute on function get_booking(text)                       from public, anon, authenticated;
revoke execute on function update_booking_customer(text, jsonb, text) from public, anon, authenticated;

-- Document numbering (invoice, LR, credit note …) is server-only too.
revoke execute on function next_doc_no(text, text)                 from public, anon, authenticated;

-- Belt and braces: the counter table never had RLS in schema.sql (it is on in
-- the live databases checked; this makes it so everywhere). No policy = only
-- the service role can touch it.
alter table doc_seq enable row level security;

-- Check (run after): every row should say false.
select p.proname as function,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_booking', 'get_booking', 'update_booking_customer', 'next_doc_no');
