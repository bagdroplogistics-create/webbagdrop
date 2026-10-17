# Bagdrop Platform — Deployment Guide

Static front end + Supabase backend. No build step: every file ships as-is.

## What's in this package

| Path | What it is |
|---|---|
| `index.html` + `booking.css/js` | Customer booking site (classic look) |
| `index-alt.html` + `booking-alt.css` | Customer booking (editorial look) |
| `admin.html` + `admin.css/js` + `login.js` | Admin OS — the full console (login-gated) |
| `y2k.html` | Y2K wedding desk (`?ops=1` = ops board) |
| `wedding.html` + `wedding.css/js` | Generic wedding landing pages (`?code=`) |
| `shared/config.js` | **The one file you edit**: Supabase keys, company block, GST 5%, payment details, ops passcode |
| `shared/db.js` | Data layer — local demo until Supabase keys are set |
| `shared/pricing.js` | Rate-chart engine (route rates, bulk rules, GST 5%) |
| `shared/ai.js` | Forecast, copilot, CRM intelligence |
| `shared/docs.js` | LR/invoice/receipt/report documents + PDF files |
| `supabase/schema.sql` | Tables, realtime, RLS, atomic doc numbering — run once |
| `import/` | Production-data import tools (transform.py, console snippet) |

## Go live in 5 steps

### 1 · Supabase (the backend) — ~15 min
1. supabase.com → New project → region **Mumbai (ap-south-1)**.
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Project Settings → API: copy the **URL** and the **anon public** key
   (never the service_role key).
4. Paste both into `shared/config.js` → `supabase: { url, anonKey }`.

### 2 · Host the site — ~10 min
Any static host. Vercel:
```bash
npm i -g vercel
vercel --prod
```
(or drag the folder into Netlify Drop, or Cloudflare Pages). The whole folder
is the site — no build command, output directory = root.

### 3 · Domain
Host dashboard → add domain `www.bagdrop.co` (or `book.bagdrop.co` /
`admin.bagdrop.co` to run beside the current site) → add the CNAME it gives
you at your DNS provider.

### 4 · First sign-in and hardening
- Open `/admin.html` → `admin@bagdrop.co` + the admin password → **change the
  seeded passwords** (settings/users in the backend).
- Change `opsPasscode` in config.js.
- Verify the rate chart (Pricing module) against the signed rate card.

### 5 · Wire the real gateways (as keys arrive)
| Service | Where | Unlocks |
|---|---|---|
| Razorpay / Stripe keys | Edge Function (payments) | Real checkout on quote links and the booking flow |
| Meta WhatsApp Cloud API | Edge Function reading the `outbox` table | Unattended sending of invoices, LRs, reminders |
| Resend (email) | same Edge Function | Email delivery of documents |
| MSG91 | Edge Function | Real SMS OTP for the price lock |
| DigiLocker / HyperVerge | Edge Function | Real Aadhaar / passport verification |
| AviationStack | Edge Function (cron) | Live flight delays re-planning pickups |
| GSP (ClearTax etc.) | Edge Function | Auto-filing e-invoice IRN + e-way bills |

Until each key exists, the platform degrades gracefully: demo OTP on screen,
manual mark-paid, outbox queues with one-click composer send.

## Production rules already encoded
- GST **5%** (GTA) everywhere · SAC 9965.
- Quote lock 24 h · ops passcode gates rate overrides and discounts.
- Document numbering: `next_doc_no()` in Postgres (race-safe, FY-prefixed).
- RLS: customers see only their booking; staff roles via JWT claim.
- Phase-2 hardening notes are at the bottom of `supabase/schema.sql`
  (move pricing + payment writes into Edge Functions).

## Importing existing production data
1. `python3 import/receive.py import/` (local receiver), paste
   `import/EXPORT-SNIPPET.js` into the console on the logged-in production
   admin — data lands as JSON.
2. `python3 import/transform.py` → `seed-bookings.json` in the Admin OS format.
3. Load into Supabase with one upsert per row (or ask Claude to run it).

## Smoke test after deploy
book on the site → appears in admin inbox → accept with captain → customer
screen updates live → create trip → LR + manifest → invoice → payment receipt
→ MIS PDF. If all eight hold, you're live.
