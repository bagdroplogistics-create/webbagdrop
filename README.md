# Bagdrop · Next.js (production build)

TypeScript + Next.js App Router + Tailwind v4 + Supabase (Postgres, Auth,
Realtime). This is a separate project from `bagdrop-web` — nothing here
touches that repo or its data.

Live and connected to a real Supabase project (`bagdrop-logistics` org,
Mumbai region), deployed at https://webbagdrop.vercel.app. Customer flow
(booking wizard, quote/pay links) and **all 19 modules** from the original
static Admin OS now exist in this app — see "Admin OS modules" below for
which are fully real vs. honest reference content.

## Run it now (local demo, no setup)
```bash
npm install
npm run dev      # http://localhost:3000
```
With no `.env.local`, it runs entirely in the browser (localStorage +
BroadcastChannel) — the booking flow and `/admin` both work, synced live
across tabs of the same browser, no account needed.

`/admin` asks for an **admin key** first. In demo mode (no Supabase) any
key works since `ADMIN_SECRET_KEY` defaults to a placeholder — this is only
meant for your own local testing, not for deploying like this.

## Setting this up again elsewhere (e.g. a fresh clone)
This repo's own `.env.local` already points at the live `bagdrop-new`
Supabase project (gitignored, not committed). To point a fresh checkout
at a *different* Supabase project instead:

1. **Create the project** — [supabase.com](https://supabase.com) → New
   project → region **Mumbai (ap-south-1)**.
2. **Run the schema**, in order, in the SQL Editor:
   - [`supabase/schema.sql`](supabase/schema.sql) (the whole file)
   - [`supabase/migration_002_crm.sql`](supabase/migration_002_crm.sql)
     (the CRM module's activity-log table — not in schema.sql's original
     run on the live project, so kept as a separate incremental file;
     folded into schema.sql for anyone starting fresh)
3. **Copy three values** from Project Settings → API into `.env.local`
   (copy `.env.example` to `.env.local` first): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (never put
   that last one in a `NEXT_PUBLIC_` variable — it bypasses every access
   rule in the database; it's only ever read server-side, in
   `src/app/api/admin/*`). Also set your own `QUOTE_SIGNING_SECRET` and
   `ADMIN_SECRET_KEY` (the `/admin/login` password).
4. Restart `npm run dev` (or redeploy).

With no `.env.local` at all, the app falls back to local-browser demo mode
(localStorage + BroadcastChannel, no account needed) — useful for quick
UI iteration without touching the real database.

## What changed from the original prototype schema
The zip this project started from (`supabase/schema.sql.original`) had two
real holes, both now closed in `supabase/schema.sql`:

- **Any visitor could read every booking** — name, mobile, price, the lot —
  with no login, by calling the Supabase REST API directly with the public
  anon key. There was a database policy allowing it (`anon_read_booking …
  using (true)`), left over from the prototype stage.
- **Any visitor could edit any booking** that was still in an editable
  status, with no check that it was *their* booking.

Fixed by removing both policies outright and replacing the customer-facing
read/write path with three Postgres functions (`create_booking`,
`get_booking`, `update_booking_customer`) that can only ever touch the one
booking whose id was passed in — there's no way to call them without
already knowing that id, and no way to list more than one row. Booking ids
also moved from a 4-digit number (9,000 possible values — guessable) to a
10-character random token, so an id now works like a courier tracking
number: unguessable, and knowing it only ever gets you that one booking.

The `/admin` console used to read/write the `bookings` table directly from
the browser with the public anon key and **no login at all**. It now goes
through `src/app/api/admin/*`, gated by an admin-key login
(`src/lib/adminAuth.ts`) and using the Supabase **service role** key
server-side — the same shared-secret pattern (`ADMIN_SECRET_KEY`) the live
`bagdrop-web` project already uses for its own admin routes.

**Trade-off:** live push-updates (Supabase Realtime) don't work for
anonymous visitors under the tightened rules, since Realtime is gated by
the same row-level security that now denies broad anon access. The booking
status page and the admin inbox both poll every few seconds instead
(`src/lib/db.ts`, `src/lib/adminApi.ts`) — a few seconds' delay instead of
instant push, in exchange for the above being actually true.

## Admin OS modules — what's live vs. reference-only
All 19 modules from the original static Admin OS now have a working page
here (grouped sidebar: Operate / Commerce / Intelligence / Platform).

**Fully real** (derive from or write to the live database): Command centre,
Shipments, Quotes & payments, LR & trips, Exceptions, Events & bulk,
Drivers, Flights, Capacity & roster, CRM, Pricing engine, Identity &
compliance, Finance, Rules & notifications, Security & audit.

**Honest reference/roadmap content** (same as the original — these were
decorative status boards or policy pages there too, not real
integrations): Partners & API, Integrations, Data & privacy.

Not ported from the static build (nothing functional is lost — none of
this was a real integration there either, only UI for it existed): real
payment capture (`/api/pay` still returns a fake "Razorpay (demo)"
result), SMS OTP / Aadhaar / passport verification, WhatsApp sending, GST
e-invoice IRP filing, e-way bill filing, printable LR/manifest/invoice
layouts, credit notes, bank-statement reconciliation, the guest-facing
wedding landing page (admin-side event management is built; the
customer-facing page isn't). Each module's own file has a comment with
its specific gaps and exactly which lines of the original it was ported
from.

## Structure
- `src/lib/types.ts` — the typed domain model (Booking, Trip, Inquiry,
  CrmActivity, DocRecord, …).
- `src/lib/pricing.ts` — pure quote engine, parameterized by `Masters`
  (route chart / cities / fallback matrix / oversize rate) so both the
  static client preview and the override-aware server routes share one
  implementation.
- `src/lib/pricingSettings.ts` — loads the effective masters (defaults
  merged with whatever the Pricing engine module has persisted).
- `src/lib/intelligence.ts` — Command centre + CRM + Pricing's shared
  analytics (stats/forecast/anomalies/lanes/crmCustomers/crmSuggestions/
  pricingSuggestions) — all computed client-side from live data, no
  external AI call.
- `src/lib/docs.ts` — GST split + financial-year helpers shared by LR/
  Finance document numbering.
- `src/lib/db.ts` — customer-facing data access (create/get/update/watch
  one booking), via the security-definer Postgres functions in schema.sql.
- `src/lib/adminAuth.ts` / `src/lib/supabaseAdmin.ts` / `src/app/api/admin/*`
  — admin login + the only code paths that use the service role key.
- `src/lib/adminApi.ts`, `tripsApi.ts`, `crmApi.ts`, `pricingApi.ts` —
  admin-side data access for each module (all bookings, trips, CRM/
  inquiries, pricing masters).
- `src/app/admin/*.tsx` — one component per Admin OS module.
- `src/app/api/quote`, `src/app/api/pay` — server-authoritative, HMAC-signed
  quoting and payment capture.
- `src/components/booking/Wizard.tsx` — the customer booking flow.
- `src/proxy.ts` — Next.js 16 renamed `middleware.ts` to this; gates
  `/admin` and `/api/admin/*` on the signed session cookie.
- `supabase/schema.sql` — run this one in Supabase (not `.original`, the
  unmodified prototype schema kept only for reference), plus
  `migration_002_crm.sql` if upgrading an already-running database.
