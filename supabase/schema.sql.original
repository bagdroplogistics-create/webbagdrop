-- Bagdrop platform schema for Supabase (run in the SQL editor).
-- Project region: Mumbai (ap-south-1).
-- Each collection is a table with a jsonb document, matching the front end's
-- data layer. status/created are lifted out for indexing and realtime filters.

create table if not exists bookings (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);
create index if not exists bookings_status_idx on bookings (status);
create index if not exists bookings_created_idx on bookings (created desc);
create index if not exists bookings_event_idx on bookings ((doc->>'eventCode'));
create index if not exists bookings_mobile_idx on bookings ((doc->'traveller'->>'mobile'));

create table if not exists events (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);

create table if not exists inquiries (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);

create table if not exists settings (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);

-- Realtime: the front end subscribes to postgres_changes on these tables.
alter publication supabase_realtime add table bookings, events, inquiries, settings;

-- ======================= ROW LEVEL SECURITY =======================
-- Launch posture (anon key in the browser):
--  * anyone may create a booking or inquiry and read a single booking by its
--    unguessable reference;
--  * only authenticated staff may list, decide, or touch settings.
-- Tighten further by moving customer writes behind an Edge Function.

alter table bookings  enable row level security;
alter table events    enable row level security;
alter table inquiries enable row level security;
alter table settings  enable row level security;

-- staff = any authenticated user whose JWT carries role 'bagdrop_staff'
create or replace function is_staff() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'bagdrop_staff', false)
$$;

-- customers: insert their booking, update it only while it is theirs to act on
create policy anon_insert_booking on bookings for insert to anon, authenticated with check (true);
create policy anon_read_booking   on bookings for select to anon, authenticated using (true);
create policy anon_update_booking on bookings for update to anon, authenticated
  using (status in ('quoted','identified','submitted','revised')) with check (true);

create policy staff_all_bookings on bookings for all to authenticated using (is_staff()) with check (is_staff());

create policy anon_read_event on events for select to anon, authenticated using (status = 'open');
create policy staff_all_events on events for all to authenticated using (is_staff()) with check (is_staff());

create policy anon_insert_inquiry on inquiries for insert to anon, authenticated with check (true);
create policy staff_all_inquiries on inquiries for all to authenticated using (is_staff()) with check (is_staff());

create policy anon_read_settings on settings for select to anon, authenticated using (id = 'rates');
create policy staff_all_settings on settings for all to authenticated using (is_staff()) with check (is_staff());

-- Trips (LR/manifest runs with expenses and advances) and the send outbox.
create table if not exists trips (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);
create table if not exists outbox (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);
alter publication supabase_realtime add table trips, outbox;
alter table trips  enable row level security;
alter table outbox enable row level security;
create policy staff_all_trips  on trips  for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all_outbox on outbox for all to authenticated using (is_staff()) with check (is_staff());

-- ATOMIC DOCUMENT NUMBERING: one sequence per document type (LR, INV, PI,
-- RCT, CSH, CV, CN, POD, TR, MF). Race-safe — replaces the browser-side
-- settings/seq counter the demo uses.
create table if not exists doc_seq (
  doc_type text primary key,
  n bigint not null default 0
);
create or replace function next_doc_no(p_type text, p_fy text)
returns text language plpgsql as $$
declare v bigint;
begin
  insert into doc_seq (doc_type, n) values (p_type, 1)
  on conflict (doc_type) do update set n = doc_seq.n + 1
  returning n into v;
  return p_type || '/' || p_fy || '/' || lpad(v::text, 4, '0');
end $$;
-- Call from the Edge Function or RPC: select next_doc_no('INV', '2026-27');

-- SEND WORKER (deploy note): an Edge Function on a 1-minute schedule reads
-- outbox rows with status='queued', sends via Meta WhatsApp Cloud API or
-- Resend using keys from the vault (settings/gateways holds references only),
-- then marks them sent. The admin UI already queues everything.

-- NOTE on production hardening (phase 2):
--  1. Move quote calculation + payment capture into Edge Functions; the
--     browser never writes quote.total or pay.* directly.
--  2. Replace anon booking updates with an Edge Function that validates the
--     allowed status transitions (accept revised price, cancel).
--  3. Scope anon_read_booking to a lookup function (reference + mobile) so
--     references cannot be enumerated.
