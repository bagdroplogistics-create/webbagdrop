# Bagdrop · Next.js (production build)

TypeScript + Next.js App Router + Tailwind v4 + Supabase (Postgres, Auth,
Realtime). This is a separate project from `bagdrop-web` — nothing here
touches that repo or its data.

Customer flow (booking wizard, quote/pay links) and an admin inbox are
implemented. **Everything below "Go live" is still demo/local-only — this
has not been connected to a real database yet.**

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

## Go live: connect a real Supabase project
I can't create the account for you, so these three steps are yours:

1. **Create the project** — [supabase.com](https://supabase.com) → New
   project → region **Mumbai (ap-south-1)** (lowest latency for India
   traffic; matches what the original design assumed).
2. **Run the schema** — open the SQL Editor and paste in the entire
   contents of [`supabase/schema.sql`](supabase/schema.sql), then run it.
   (`schema.sql.original` is kept alongside it for reference — see
   "What changed from the prototype" below for why it's not what you want.)
3. **Copy three values** from Project Settings → API into `.env.local`
   (copy `.env.example` to `.env.local` first):
   - `NEXT_PUBLIC_SUPABASE_URL` — the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the "anon public" key
   - `SUPABASE_SERVICE_ROLE_KEY` — the "service_role" key (Project Settings
     → API → reveal). **Never share this one or put it in a NEXT_PUBLIC_
     variable** — it bypasses every access rule in the database. It's only
     read on the server, in `src/app/api/admin/*`.

   Also set your own values for:
   - `QUOTE_SIGNING_SECRET` — any long random string
   - `ADMIN_SECRET_KEY` — any long random string; this is the password
     you'll type into `/admin/login`

4. Restart `npm run dev` (or redeploy). The app detects the Supabase env
   vars automatically and switches out of demo mode — no code change.

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

## Still demo/not wired (unchanged from the original prototype)
Same list as the static build this was ported from:
- Payment capture (`/api/pay`) returns a fake "Razorpay (demo)" result —
  no real Razorpay/Stripe integration.
- SMS OTP, Aadhaar/passport verification, WhatsApp sending, live flight
  data, GST e-invoice filing — all UI stand-ins, no provider keys wired.
- Most of the full Admin OS (CRM, pricing engine, finance, LR/trip docs,
  forecast/copilot, etc. — see the static `admin.html` for the complete
  module list) hasn't been ported into this Next.js app yet; only the
  bookings inbox has. Porting the rest is a separate, larger piece of work.

## Structure
- `src/lib/types.ts` — the typed domain model.
- `src/lib/pricing.ts` — pure quote engine (client preview + server route).
- `src/lib/db.ts` — customer-facing data access (create/get/update/watch
  one booking), via the security-definer Postgres functions above.
- `src/lib/adminAuth.ts` / `src/app/api/admin/*` — admin login + the only
  code path that uses the service role key.
- `src/lib/adminApi.ts` — admin-side data access (all bookings), used by
  `src/app/admin/Inbox.tsx`.
- `src/app/api/quote`, `src/app/api/pay` — server-authoritative, HMAC-signed
  quoting and payment capture.
- `src/components/booking/Wizard.tsx` — the customer booking flow.
- `supabase/schema.sql` — run this one in Supabase, not `.original`.
