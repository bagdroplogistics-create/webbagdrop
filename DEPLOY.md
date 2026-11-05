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
| `QUOTE_SIGNING_SECRET` | **yes** | Signs quotes so prices can't be edited in the browser. It also signs the customer tracking and driver links, so never change it after go-live. |
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

## 3c · Moves calendar and live tracking

- **Moves calendar** (BAGDROP OS → Operations → Moves calendar):
  - Month, week and day views of every pickup, line-haul and delivery.
  - Drag a pickup or delivery to another date to reschedule it. A reason is required, and the customer gets a WhatsApp and email.
  - Clubbing suggestions, a "Club into trip" button (LR & trips) and run sheets.
  - Vehicle capacities are set under ⚙ Fleet (settings row `fleet`).
  - **Control tower** above and beside the calendar:
    - KPI tiles: moves, pieces with XL, 30-day on-time %, at-risk, clubbing savings and peak city load.
    - At-risk feed: no captain assigned, unconfirmed bookings about to pick up, overdue deliveries, moves past their ETA, and over-capacity cities.
    - A city × day load heatmap and lane flow.
  - Animations use the `motion` package (pinned at 13.5.1 in package.json; installed by `npm install`) and respect the device's reduce-motion setting.
  - Pieces are counted at actuals; oversize items are flagged **XL**.
- **Live tracking** (BAGDROP OS → Live tracking): an animated map of every confirmed move until delivery.
  - Positions come from the milestones scanned in Operations, plus the ETA the team types for the next step.
  - When a driver's phone is sharing, it shows live GPS instead.
- **Links:** all are signed with `QUOTE_SIGNING_SECRET`, so that secret must be set and must never change after go-live, or every link already sent stops working.
  - **Customer link `/t/…`:** no login needed, and it stops working at delivery. It is in the WhatsApp/email at pickup, departure, arrival, out-for-delivery and delivery, and behind the Track button in My bookings and on the partner desk.
  - **Driver link `/d/…`:** sent automatically to whoever is assigned to a leg in Operations, if a mobile is on file. The driver taps Start trip, and the phone shares its location every 30 seconds until Done, or until the leg's milestone is scanned.
  - **GPS storage:** fixes are kept in settings rows `gps:<booking>`, never on the booking itself.
- **Requirements:** GPS needs the site on **https** (Vercel is). The map is drawn in-house, so no map service or API key is needed.

## 3d · Move Pass, bag tags, seals and stickers (airline-grade)

- **Tag number (licence plate):** `BD BDQ 004218 7`, made of:
  - the Bagdrop code;
  - the origin hub letters;
  - a 6-digit serial, one series per hub;
  - a check digit.

  Code 128 encodes `BDBDQ0042187`. The route code `BD-BDQ-BOM-7F3K2-5-K` is still printed underneath and still scans. Serials come from the database counter `next_doc_no` (`TAG-<hub>`, `SEAL-<hub>`), so a number is never reused.
- **Issuing and printing** (BAGDROP OS → Operations → a shipment → Bag tags & seals). Each booking gets a plate and a security seal per piece; re-issuing only fills pieces that have none.
  - **Loop tags:** loop-tag stock (54 × 457 mm), or a 4×6 label folded through the handle.
  - **Labels:** backup labels, stickers (XL, HEAVY, FRAGILE, PRIORITY, THIS WAY UP) and seals.
  - **Media:** 4×6 thermal (100 × 150 mm), A4 8-up sheets (99.1 × 67.7 mm), or Zebra ZPL (203 dpi).
  - **Brother QL-800:**
    - **DK-11202 die-cut 62 × 100 mm:** a loop tag prints as two labels, the tag face and the claim stub.
    - **DK-22205 continuous 62 mm:** a loop tag prints as one 62 × 210 mm strip.
    - Print from the browser with paper 62 mm, margins None and scale 100%. The QL-800 doesn't take ZPL.
    - Sticker pictograms are pure black (no emoji), so they print cleanly on thermal printers.
  - **Print at 100% scale.** Seals must go on **VOID tamper-evident label stock**.
  - Captains can print the same labels from their driver link on a portable printer.
- **Pickup check-in** (captain's driver link):
  - for each bag: scan the tag, scan its own seal, enter the weight (over 32 kg needs confirming, and a HEAVY sticker prints) and take a photo;
  - then the customer signs.
  - That completes "Picked up & sealed". It is still blocked until Aadhaar is verified and the LR is issued.
  - Photos and signatures go to the private storage bucket `bag-photos`, which is created automatically.
- **Delivery claim check** (captain's driver link):
  - scan the customer's Move Pass;
  - scan every tag;
  - the customer reads out a 6-digit OTP (only a hash is stored; it expires in 30 minutes, and 5 wrong tries lock it).
  - POD is recorded only when all three match.
- **Move Pass** `/p/…` (signed link):
  - a boarding-pass style pass with the passenger, route, pickup slot, pieces with XL, every tag, addresses, captains, a QR code, a PDF417 code and a claim stub;
  - **Download PDF** prints it on A4;
  - it is sent on confirmation and again at pickup with every tag number, and it is in My bookings and on the partner desk.
- **Found-bag page** `/b/<plate>`: the QR on every tag opens it. It confirms the tag is genuine and offers WhatsApp or a call to Bagdrop. No customer data is shown.
- **Apple / Google Wallet:** add the keys listed in `.env.example` (`APPLE_*` and `GOOGLE_WALLET_*`) and redeploy. The "Add to Wallet" buttons appear by themselves.
- **Scanners:** phone cameras (Chrome on Android reads barcodes; on iPhone, type or use a scanner gun) or USB/Bluetooth scanner guns, which type into the focused field.

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
4. Then run `supabase/migration_004_private_events.sql` in the same SQL editor.
   - It stops the public key from reading event records (host mobile, team, rates) or
     writing inquiries directly. The wedding pages read events through `/api/event` instead.
5. Create your own BAGDROP OS login: sign in once with the owner key (the "Owner key"
   link on `/admin/login`), then Security & audit → Users → New user, department
   Management. After that use your own login; the owner key is for emergencies.

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
