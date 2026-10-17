# Bagdrop Platform

Fresh build of the Bagdrop booking platform from the platform spec:
customer booking front end, wedding guest landing pages, and the Admin OS,
all on one shared data layer that runs locally out of the box and switches
to Supabase with two config values.

## Pages

| Page | What it is |
|---|---|
| `index.html` | Customer booking — 8 steps: service → route → date/slot → bags → traveller → OTP-locked price → identity → pay. Plus track-a-booking (`#track`) and the wedding inquiry form (`#inquiry`). |
| `admin.html` | Admin OS — command centre, bookings inbox (accept / revise / reject / assign / progress), exceptions, weddings & events (open a wedding, convert inquiries, guest links), pricing matrix, identity ledger, finance. |
| `wedding.html?code=WED-XXXXX` | The guest landing page for one wedding — hero, countdown, family booking (no rate ever shown), track by mobile. |

## Run it

Everything is static; serve the folder with anything:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 (customer) and http://localhost:8080/admin.html
(admin) side by side — a booking made on one appears live on the other.

**Demo codes** (until the real gateways are wired): price-unlock OTP is shown
on screen after "Send code"; the Aadhaar/UIDAI code is `112233`.

## Go live on Supabase

1. Create a Supabase project in **Mumbai (ap-south-1)**.
2. Run `supabase/schema.sql` in the SQL editor (tables, realtime, RLS).
3. Paste the project URL and **anon** key into `shared/config.js`.

That's it — the same pages now read and write Supabase with realtime sync
across all devices. The RLS file documents the phase-2 hardening: move
pricing/payment writes into Edge Functions, scope booking reads to
reference + mobile.

## Still stubbed (adapters in place, keys needed)

- SMS OTP gateway (price unlock) — demo shows the code on screen
- UIDAI DigiLocker / Aadhaar app / passport KYC — demo verifies with `112233`
- Razorpay / Stripe checkout — demo marks payment captured
- WhatsApp Business API — demo shows toasts
- Live flight feeds (ADS-B) — listed under Roadmap modules in the admin

## Architecture

```
shared/config.js    Supabase keys + platform constants
shared/db.js        data layer: Supabase realtime, or local demo (localStorage
                    + BroadcastChannel) with the identical API
shared/pricing.js   quote engine: region matrix, oversize, handling, slab,
                    peak, GST — mirrored in an Edge Function for production
shared/theme.css    design tokens (light + dark) and shared components
supabase/schema.sql tables, indexes, realtime publication, RLS policies
```

Statuses: `quoted → identified → submitted → accepted → assigned →
picked_up → in_transit → delivered`, with `revised`, `rejected`, `cancelled`
as branches. Every change appends to the booking's `events[]` log, which both
the customer status card and the admin feed render.
