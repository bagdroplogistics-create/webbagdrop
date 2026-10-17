-- Bagdrop platform schema for Supabase (run in the SQL editor).
-- Project region: Mumbai (ap-south-1).
-- Each collection is a table with a jsonb document; status/created are lifted
-- out for indexing and realtime filters.
--
-- SECURITY MODEL (tightened vs. the original prototype schema — see
-- schema.sql.original for the version this replaces):
--   The prototype let ANY visitor with the public anon key run
--   `select * from bookings` (read every customer's name/mobile/price) and
--   `update` any booking in an editable status (no ownership check at all).
--   Both are closed here: anon/authenticated have NO direct table grants on
--   `bookings`. The only way in for a customer is through three
--   SECURITY DEFINER functions below, each of which only ever touches the
--   one row whose id was passed in — there is no code path that can return
--   or modify more than one booking without the staff role.
--   Booking ids are also now a 10-character random token (not a 4-digit
--   number), so they work like a courier tracking number: unguessable, and
--   knowing one only ever gets you that one booking.

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

-- CRM activity log (follow-up notes, nudges, win-backs). Staff-only —
-- there is no anon access to this table at all, direct or otherwise.
create table if not exists crm (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);

alter publication supabase_realtime add table bookings, events, inquiries, settings, trips, outbox, crm;

-- ======================= ROW LEVEL SECURITY =======================
alter table bookings  enable row level security;
alter table events    enable row level security;
alter table inquiries enable row level security;
alter table settings  enable row level security;
alter table trips     enable row level security;
alter table outbox    enable row level security;
alter table crm       enable row level security;

-- staff = any authenticated user whose JWT carries role 'bagdrop_staff'
-- (set via Supabase Auth app_metadata — see README for how to grant it to
-- your admin account). The admin web app in this project does NOT use this
-- path yet; it authenticates with a server-side ADMIN_SECRET_KEY instead
-- (see src/app/api/admin) and reads/writes via the service role key, which
-- always bypasses RLS. This policy exists so a future Supabase-Auth-based
-- admin login works without a schema change.
create or replace function is_staff() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'bagdrop_staff', false)
$$;

-- bookings: NO direct anon/authenticated table policy. Every customer-facing
-- read/write goes through the SECURITY DEFINER functions below, which can
-- only ever touch a single row matched by its (unguessable) id.
create policy staff_all_bookings on bookings for all to authenticated using (is_staff()) with check (is_staff());

create policy anon_read_event on events for select to anon, authenticated using (status = 'open');
create policy staff_all_events on events for all to authenticated using (is_staff()) with check (is_staff());

create policy anon_insert_inquiry on inquiries for insert to anon, authenticated with check (true);
create policy staff_all_inquiries on inquiries for all to authenticated using (is_staff()) with check (is_staff());

create policy anon_read_settings on settings for select to anon, authenticated using (id = 'rates');
create policy staff_all_settings on settings for all to authenticated using (is_staff()) with check (is_staff());

create policy staff_all_trips  on trips  for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all_outbox on outbox for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all_crm    on crm    for all to authenticated using (is_staff()) with check (is_staff());

-- ======================= CUSTOMER BOOKING ACCESS =======================
-- Random 10-char id from an unambiguous 31-character alphabet (no 0/O/1/I/L):
-- ~31^10 ≈ 8.2×10^14 combinations — not practically guessable.
create or replace function gen_booking_id() returns text language plpgsql as $$
declare chars text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; s text := ''; i int;
begin
  for i in 1..10 loop
    s := s || substr(chars, (floor(random() * length(chars)))::int + 1, 1);
  end loop;
  return 'BD-' || extract(year from now())::text || '-' || s;
end $$;

-- Creates a new booking server-side (the id is generated here, never trusted
-- from the browser) and returns the full saved document.
create or replace function create_booking(p_doc jsonb) returns jsonb
language plpgsql security definer as $$
declare v_id text; v_doc jsonb;
begin
  loop
    v_id := gen_booking_id();
    exit when not exists (select 1 from bookings where id = v_id);
  end loop;
  v_doc := p_doc || jsonb_build_object('id', v_id);
  insert into bookings (id, doc, status, created) values (v_id, v_doc, v_doc->>'status', now());
  return v_doc;
end $$;
revoke all on function create_booking(jsonb) from public;
grant execute on function create_booking(jsonb) to anon, authenticated;

-- Fetches exactly one booking by id. Cannot be used to list/enumerate —
-- there is no way to call this without already knowing the id.
create or replace function get_booking(p_id text) returns jsonb
language sql security definer stable as $$
  select doc from bookings where id = p_id;
$$;
revoke all on function get_booking(text) from public;
grant execute on function get_booking(text) to anon, authenticated;

-- Merges a patch into one booking — only while it's still in a customer-
-- editable status (mirrors the status machine in the admin + booking UI).
-- p_event, if given, is appended to doc.events as a "customer" entry.
create or replace function update_booking_customer(p_id text, p_patch jsonb, p_event text default null)
returns jsonb language plpgsql security definer as $$
declare v_doc jsonb; v_status text;
begin
  select doc into v_doc from bookings where id = p_id;
  if v_doc is null then raise exception 'NOT_FOUND'; end if;
  v_status := v_doc->>'status';
  if v_status not in ('quoted', 'identified', 'submitted', 'revised') then
    raise exception 'NOT_EDITABLE';
  end if;
  v_doc := v_doc || p_patch;
  if p_event is not null then
    v_doc := jsonb_set(
      v_doc, '{events}',
      coalesce(v_doc->'events', '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object('at', now(), 'by', 'customer', 'text', p_event))
    );
  end if;
  update bookings set doc = v_doc, status = v_doc->>'status' where id = p_id;
  return v_doc;
end $$;
revoke all on function update_booking_customer(text, jsonb, text) from public;
grant execute on function update_booking_customer(text, jsonb, text) to anon, authenticated;

-- ATOMIC DOCUMENT NUMBERING: one sequence per document type (LR, INV, PI,
-- RCT, CSH, CV, CN, POD, TR, MF). Race-safe.
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

-- SEND WORKER (not yet deployed): an Edge Function on a schedule would read
-- outbox rows with status='queued' and send via WhatsApp/Email provider
-- keys, then mark them sent. Today the admin UI queues sends but a human
-- clicks through (wa.me link / mailto) — see README "What's still manual".
