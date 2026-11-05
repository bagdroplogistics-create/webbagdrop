# Bagdrop platform release · 5 Nov 2026

Source: bagdrop-new, commit 245a9fa. No secrets inside; copy `.env.example` to `.env.local` and fill it.

## Run
    npm install
    npm run build
    npm start -p 3000
Admin: http://localhost:3000/admin · Guide: /admin/guide · Tutorials: /admin/tutorial and /admin/tutorial/wedding

## New since the 3 Nov release
- Phase 1 ops journey: Aadhaar gate switched off (code kept, NEXT_PUBLIC_AADHAAR_REQUIRED=1 turns it back on). Payment accepted → LR issued automatically → pickup, middle mile, last mile and POD all recorded from Operations. No driver app or third-party integration (NEXT_PUBLIC_DRIVER_APP=1 re-enables the captain links).
- Operations desk: table list with the next step per booking, stage ladder, step forms, undo last step with reason, problem log with client message and tracking note. Masters tab for captains, vehicles, hubs, vendors.
- Cancel and restore: anyone with Edit on Shipments; refunded bookings restore with a Finance alert; client messaged on both.
- Quote editable after payment (top-up due or credit note). LR editable after issue with version history.
- Client-facing: tracking page and WhatsApp messages at captain assigned, reached hub, problem raised, out for delivery, delivered.
- Admin OS design pass: rail collapses under 1440px, full-width LR and data-entry screens, density toggle, Focus mode, icon-free.
- Tutorials: main tutorial (inquiry → delivery → invoice → reconciliation) and the weddings & events tutorial (guest desk, Admin OS, planner desk) with screenshots; Word copies in the outputs folder.
- Weddings & events: Manifest page per event (Pickup plan by date/slot/area, Delivery plan by room, Return plan, All bags, Missing list, CSV, print) with run/order/time/captain/vehicle saved on each family's booking.
- Fix: a screen holding an older copy of a booking now gets STALE and retries instead of a wrong undo refusal.

## Tests (QA suites, separate folder)
journey 105/105 · lifecycle 51/51 · inhouse 26/26 · wedtour 30/30 · wedmanifest 27/27 · stagechange 12/12 · full runall green.

## Before go-live
Change the admin password / ADMIN_SECRET_KEY; set the WhatsApp templates; review legal pages and insurance copy; run migration_004; set the cron.
