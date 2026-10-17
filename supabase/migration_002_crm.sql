-- Incremental migration for an already-running bagdrop-new database:
-- adds the `crm` activity-log table used by the new CRM module.
-- (schema.sql now includes this too, for anyone setting up fresh.)

create table if not exists crm (
  id text primary key,
  doc jsonb not null,
  status text,
  created timestamptz not null default now()
);

alter publication supabase_realtime add table crm;

alter table crm enable row level security;

create policy staff_all_crm on crm for all to authenticated using (is_staff()) with check (is_staff());
