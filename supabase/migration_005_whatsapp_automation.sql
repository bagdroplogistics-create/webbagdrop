-- WhatsApp Chatbot & Automation module — three new tables, same jsonb-doc
-- shape as every other collection in schema.sql (bookings/events/crm/...).
-- Run this once in the Supabase SQL editor against the bagdrop-new project
-- (the same project deploy/admin-1 already uses) BEFORE the module is
-- deployed — every new API route under /api/admin/whatsapp-automation and
-- the extended /api/hooks/whatsapp webhook assume these tables exist.
--
-- Quota note (2026-11-19): this project's org is currently over its free-
-- tier quota (see the admin's own dashboard banner). These tables are kept
-- deliberately lean to avoid adding to that:
--   · id is the primary lookup key everywhere (no extra unique index needed
--     for the hot path — wa_conversations.id IS the customer's normalized
--     10-digit mobile, so "find this customer's conversation" is a PK
--     lookup, not a jsonb index scan).
--   · NOT added to the `supabase_realtime` publication — nothing in this
--     module subscribes to Postgres realtime (the admin UI polls over HTTP,
--     same pattern as every other admin screen), so publishing changes here
--     would be pure overhead with zero consumer.
--   · wa_events (the Automation History log) is append-only and grows
--     fastest; src/lib/waFollowUp.ts prunes rows older than 90 days once a
--     day as part of the existing automation sweep — see that file.

create table if not exists wa_conversations (
  id text primary key,          -- normalized 10-digit mobile, no country code
  doc jsonb not null,            -- WaConversation (src/lib/waTypes.ts)
  status text,                   -- mirrors doc.state: bot | human | resolved | opted_out
  created timestamptz not null default now()
);
create index if not exists wa_conversations_status_idx on wa_conversations (status);
create index if not exists wa_conversations_created_idx on wa_conversations (created desc);

create table if not exists wa_messages (
  id text primary key,          -- Meta's wamid for inbound; a generated token for outbound/manual
  doc jsonb not null,            -- WaMessage (src/lib/waTypes.ts)
  status text,                   -- direction: in | out
  created timestamptz not null default now()
);
create index if not exists wa_messages_conv_idx on wa_messages ((doc->>'conversationId'), created);

create table if not exists wa_events (
  id text primary key,          -- generated token (idempotency key where applicable)
  doc jsonb not null,            -- WaEvent (src/lib/waTypes.ts) — the Automation History log line
  status text,                   -- event type: message_in | auto_reply | lead_created | lead_linked
                                  --   | quote_drafted | quote_sent | handover | followup_scheduled
                                  --   | followup_sent | opt_out | error
  created timestamptz not null default now()
);
create index if not exists wa_events_created_idx on wa_events (created desc);
create index if not exists wa_events_conv_idx on wa_events ((doc->>'conversationId'));

-- ======================= ROW LEVEL SECURITY =======================
-- Same model as every other table: staff (service role, via the admin API
-- routes' own isAdminRequest() + access.ts permission check) only. No anon
-- access of any kind — the WhatsApp webhook itself authenticates to Meta,
-- not to Supabase, and writes via the service role key, which bypasses RLS
-- the same way every other server route in this project already does.
alter table wa_conversations enable row level security;
alter table wa_messages      enable row level security;
alter table wa_events        enable row level security;

create policy staff_all_wa_conversations on wa_conversations for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all_wa_messages      on wa_messages      for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all_wa_events        on wa_events        for all to authenticated using (is_staff()) with check (is_staff());
