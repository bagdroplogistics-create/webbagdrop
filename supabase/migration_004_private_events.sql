-- migration_004 — close the last two direct anon paths (run in the Supabase
-- SQL editor AFTER deploying the code that reads events via /api/event).
--
-- 1. events: anon could SELECT every open event's full record (host mobile,
--    planner, event-company team and mobiles, rates). The guest pages now
--    read a reduced public view through /api/event (service role), so the
--    anon policy goes.
-- 2. inquiries: anon could INSERT any row straight into the table, bypassing
--    the API's checks. Every inquiry is written server-side (service role).
--
-- Re-runnable.
drop policy if exists anon_read_event on events;
drop policy if exists anon_insert_inquiry on inquiries;
