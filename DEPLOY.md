# Deploying Bagdrop — release 2026-10-30

This zip is the full source of the Bagdrop platform: the website and booking flow, the
customer dashboard, bond signing, the partner (B2B) desk, wedding pages, and BAGDROP OS.
It was checked before packing:

- Clean production build, TypeScript 0 errors, ESLint 0 problems.
- `scripts/deepcheck.mjs`: 61/61.
- End-to-end suites, 6 of them, 141 checks, all passed.
- All 25 BAGDROP OS modules and every public page opened in a browser with no errors.

**Never put `.env.local` (or any real key) in a zip, a repo or a chat.**
Keys go only into Vercel → Settings → Environment Variables.

## 1 · Build

```bash
npm ci
npm run build      # Next.js 16.4.2, Node 20 or 22
npm run start      # local check on http://localhost:3000
```

## 2 · Environment variables (Vercel → Production and Preview)

| Variable | Needed | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase secret/service key (server only) |
| `ADMIN_SECRET_KEY` | **yes** | BAGDROP OS sign-in key; also signs admin sessions and OTPs |
| `QUOTE_SIGNING_SECRET` | **yes** | Signs quotes so prices can't be edited in the browser |
| `CRON_SECRET` | **yes** | Lets the daily Vercel cron run `/api/worker` |
| `SITE_URL` | **yes** | The address this app is served from, e.g. `https://webbagdrop.vercel.app`. All WhatsApp and email links use it. Change it when the domain moves. |
| `META_WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | **yes, before go-live** | WhatsApp Business sender (see 3) |
| `RESEND_API_KEY`, `EMAIL_FROM` | **yes, before go-live** | Email sender (see 3) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | recommended | Online payment in My bookings (card, UPI, netbanking, wallet) — see 3a. Without them the Pay online button is hidden and customers pay by UPI QR / bank transfer for finance to verify. |
| `RAZORPAY_WEBHOOK_SECRET` | recommended with Razorpay | Lets `/api/hooks/razorpay` settle a payment if the customer's browser closes mid-payment |
| `PROD_SUPABASE_URL`, `PROD_SUPABASE_SERVICE_ROLE_KEY`, `PROD_SITE_URL`, `PROD_ADMIN_API_KEY` | optional | Shows bagdrop.co (bagdrop-web) leads in the Shipments inbox and CRM |
| `Y2K_SHEET_WEBHOOK_URL`, `Y2K_SHEET_SECRET` | optional | Copies wedding bookings to a Google Sheet |
| `ALLOW_DEMO_CODES` | **never on production** | `1` re-enables on-screen demo OTP codes, for a preview only |
| `AADHAAR_DEMO_OTP` | local only | Demo Aadhaar code (default 112233); ignored on Vercel |

## 3 · Before go-live: connect WhatsApp or email

On any Vercel deployment, the app **never shows a one-time code on screen**. It also
never accepts the demo Aadhaar code. If neither WhatsApp nor email is connected:

- the booking OTP and the bond-signing OTP answer *"we can't send codes right now"*;
- customers cannot complete a booking online.

Connect at least one sender (section 2) before the site goes public.

**Aadhaar e-sign** needs a licensed eSign provider, which is not connected yet.
Until it is:

- Indian guests see *"our team will call you"* on the bond page;
- staff verify them by phone in Identity & compliance;
- pickup can then be released with a recorded override.

International guests (passport + visa + email code) work fully.

## 3a · Razorpay (online payment)

- **Test keys** (`rzp_test_…`) on preview, **live keys** (`rzp_live_…`) on production. Use
  Razorpay Dashboard → Account & Settings → API Keys. Live keys need the Razorpay account
  activated (KYC).
- **Webhook:**
  - URL: Razorpay Dashboard → Webhooks → `https://<SITE>/api/hooks/razorpay`;
  - events: **`payment.captured`** and **`payment_link.paid`**;
  - choose a webhook secret and set the same value as `RAZORPAY_WEBHOOK_SECRET`.
- **The flow:**
  1. The team approves the booking.
  2. The customer clicks **Pay online** in My bookings. `/api/create-order` creates the
     order; the amount is taken from the booking, never from the browser.
  3. The customer pays in the Razorpay window.
  4. `/api/verify-payment` checks the signature and asks Razorpay to confirm the capture
     and amount.
  5. The booking is marked paid. The 5% GST invoice, the receipt and the bond request go out
     automatically. Finance has nothing to verify.
- Extra-bags top-ups can be paid online the same way.
- **Payment Links:**
  - Approving a booking in BAGDROP OS creates a Razorpay link for the amount due and puts it in the approval WhatsApp/email.
  - Shipments → **WhatsApp payment link / Copy pay link** resends it.
  - The customer pays on Razorpay's page and returns to My bookings. The booking is marked paid from Razorpay's own records, through the return redirect, the `payment_link.paid` webhook, or the automation sweep as a safety net.
  - Revise, hold, reject, or a customer price change cancels the open link.
  - Paying by one method cancels the other open link. A second full payment is flagged in Command centre for a refund, never applied twice.
- **"Scan & pay by UPI"** in My bookings opens Razorpay's dynamic UPI QR for the exact amount, which is confirmed automatically.
  - The standalone **QR Codes API** (printable QR codes) is **not enabled** on this Razorpay account. Ask Razorpay support to enable it if printed QR codes are wanted.

## 3b · Pricing engine and instant booking

- **Prices change only in BAGDROP OS → Pricing engine:**
  1. Edit (a draft — nothing is live yet).
  2. Review the change list, the checks and the before/after preview.
  3. Publish with a note. That creates version N+1.
  - Hard errors block publishing; for example 2 bags priced below 1 bag, an unknown city, a duplicate route, or a ₹0 rate.
  - Warnings (a move of more than ±25%, margin below target, a 6-bag price lower than 5 bags) must be confirmed.
  - An engine self-test runs on every publish.
  - Every version keeps a full snapshot. **Roll back** from Version history.
- **Chart rates are before GST** — the engine adds 5%.
- **Off-chart routes are "rate on request" everywhere.** The old zone matrix is retired.
- **Instant booking:** switch it on per route, with:
  - minimum notice (default 5 days to pickup);
  - active dates, blackout dates and weekdays;
  - instant bookings per day, maximum bags, and whether oversize pieces qualify.

  How it works:
  - A qualifying website booking is auto-approved, and the customer pays at once by checkout or payment link.
  - If it isn't paid within the hold (default 30 minutes), it goes to the team for approval.
  - Wallet/credit partners on an instant route are confirmed immediately. Collect-and-remit partners still go to the team.
- **Profitability:**
  - cost per booking (Operations cost model), margin, target-margin chart rates;
  - 90-day bookings, conversion, revenue and actual margin;
  - benchmarks, "routes to add" from unpriced requests, and the new-route wizard.
  - **Enter real per-route costs.** The defaults (₹400 + ₹1,200 + ₹400, plus ₹250 per extra bag, 55% target) are placeholders.
- **Settings rows used:** `routes` (live + version), `routes_draft`, `pricing_log`, `pricing_benchmarks`, `costmodel`. No database migration is needed.

## 4 · Deploy, then lock the database (order matters)

1. Deploy this code to Vercel. `vercel.json` adds a daily cron at 03:00 UTC; actions in
   the app also trigger the automation immediately.
2. Open the live site and check:
   - homepage, `/book`, `/account`, `/partner`, `/admin`;
   - make one booking with a real phone number and confirm the OTP arrives.
3. **Only after step 2 works**, open the Supabase SQL editor for the project in
   `NEXT_PUBLIC_SUPABASE_URL` and run `supabase/migration_003_lockdown.sql`.
   - Its last query must show `false` in every row.
   - It removes old public database functions that the previous site version used.
     Running it before the new code is live would break bookings on the old site.

Already in place in the Supabase project (no action):

- the tables;
- the private storage buckets `payment-proofs` and `identity-docs` (created automatically if missing);
- payment details (UPI and bank), ops alert contacts, and partner accounts, all edited in BAGDROP OS.

## 5 · After go-live

- **Rotate any key that was ever shared outside Vercel**: Supabase keys, `ADMIN_SECRET_KEY`,
  `QUOTE_SIGNING_SECRET`, `PROD_ADMIN_API_KEY`.
  - Locally, `node scripts/rotate-secrets.mjs` updates `.env.local` without printing values.
  - Then set the same values in Vercel.
- **Partner agents**: BAGDROP OS → Partners & API → Invite (WhatsApp / email). Each invite
  carries the portal link, the agent code and the key.
- **System check**:
  - Command: `BASE=<site> ADMIN_SECRET_KEY=<key> node scripts/deepcheck.mjs`.
  - It only reads data, except its automation sweep.
  - The OTP checks fail on a live site by design, because codes are not shown there.

## Open decisions (owner: Bagdrop)

- **Collect-and-remit partner bookings** are treated as paid when the agent books (the
  amount owed shows in the agent ledger). Website bookings wait for finance to verify payment.
- **The bond text** (`src/lib/indemnity.ts`, version 2026-10-30.1) should be reviewed by
  counsel. Any change needs a version bump.
