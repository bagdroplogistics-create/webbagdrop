# Bagdrop Booking Tutorial — Script, Shot Breakdown & Production Notes

**Final video:** `bagdrop_tutorial_16x9.mp4` — 1920×1080, 16:9, 30fps, H.264/AAC, **53.6 seconds**
**Source:** real booking flow captured live from https://www.bagdrop.co/new-website (desktop view), 2026-11-04
**Voice:** synthesized neural voiceover (en-IN, male), generated locally — no stock VO/footage used
**Music:** a soft synthesized ambient pad (self-generated tones, not a licensed/stock track), mixed low under the voiceover

---

## 1. Confirmation: follows the real frontend flow

Every screen shown is an actual screenshot of the live `/new-website` booking widget, captured step by step while manually filling the real form. Nothing was invented or mocked up. The flow shown is exactly:

**Step 1 — Service** → **Step 2 — Route** → **Step 3 — When (travel details)** → **Step 4 — Bags** → **Step 5 — You (traveller details)** → **Step 6 — Verify**

This matches the live site's own "STEP X OF 6" labels and progress bar exactly, including its real copy ("price shown after verification", "Needs 24 hours' notice", "Never pack liquor, cash, jewellery...", etc.).

All demo data is fictional:
- Name: **Rahul Sharma** (placeholder)
- Mobile: **9800000000** (placeholder — not a real/working number)
- Email: **demo.traveller@example.com** (placeholder)
- Address: **B-204, Sunrise Residency, Satellite Road** (placeholder)
- Route: Ahmedabad → Mumbai (the site's own pre-filled rate-chart example), 3–4 bags, flight 6E 5219

No real payment, email, WhatsApp, or SMS was triggered at any point.

---

## 2. What could NOT be demonstrated (and why)

The booking flow's final step — **Step 6, "Verify to see your price"** — requires sending a real one-time password via WhatsApp/SMS or email to confirm the customer's contact details. Per the task's safety constraints, **no real OTP/WhatsApp/SMS/email send was triggered**, so the flow could not be pushed past this screen.

Consequently:
- The actual **price reveal** and the **final "booking confirmed" / success screen** were never reached and are **not shown** in the video, because reaching them is gated behind a real-world message send.
- The video is honest about this: Scene 5's voiceover explicitly says *"once verified, your exact price appears, and our team takes it from there"* — describing what happens next without fabricating a screen that was never actually seen.
- No fake success/confirmation screen was created to paper over this gap.

Everything **before** that gate (6 of 6 steps, including the verify screen itself) was captured from the real, live site.

---

## 3. Scene-by-scene breakdown (condensed to ~60s)

| # | Time (approx.) | Scene | On-screen | Caption / Voiceover |
|---|---|---|---|---|
| 1 | 0:00–0:07.5 | **Intro** | Real hero section: luggage-cart photo, "Book in two minutes" headline, Bagdrop logo | *"Travelling with heavy bags? Bagdrop picks them up, and delivers them ahead of you."* |
| 2 | 0:07.5–0:16.6 | **Step 1 · Service** | Real "Choose your service" card — Home→Airport selected, booking summary sidebar | *"Head to bagdrop dot co, and tell us your trip — home to airport, hotel to hotel, even door to door."* |
| 3 | 0:16.1–0:27.0 | **Steps 2–4 · Route, When, Bags** | 3-panel collage of the real Pickup & Delivery, Travel Details, and Bags & Pieces cards (fanned layout) | *"Add your pickup and delivery cities, your travel details, and your bag count. Bagdrop even suggests your best pickup time."* |
| 4 | 0:26.5–0:34.0 | **Step 5 · Your details** | Real "Traveller details" card — name/mobile/email fields filled, live booking summary on the right | *"Enter your name, number and email, and review your full booking summary on the right."* |
| 5 | 0:33.5–0:44.7 | **Step 6 · Verify** | Real "Verify to see your price" card — WhatsApp/SMS and Email confirmation tiles | *"One quick verification code confirms it's you. Once verified, your exact price appears, and our team takes it from there."* |
| 6 | 0:44.2–0:53.6 | **Outro / CTA** | Branded closing card — Bagdrop logo, "Travel light. We carry the rest.", Book a Pickup button, bagdrop.co | *"Sealed, tracked and delivered — before you even land. Book your pickup today, at bagdrop dot co."* |

Transitions: 0.5s cross-dissolve between every scene. Subtle Ken Burns (slow zoom) on every shot to keep the video alive even on static screenshots.

---

## 4. Full voiceover script (verbatim, as recorded)

1. *"Travelling with heavy bags? Bagdrop picks them up, and delivers them ahead of you."*
2. *"Head to bagdrop dot co, and tell us your trip — home to airport, hotel to hotel, even door to door."*
3. *"Add your pickup and delivery cities, your travel details, and your bag count. Bagdrop even suggests your best pickup time."*
4. *"Enter your name, number and email, and review your full booking summary on the right."*
5. *"One quick verification code confirms it's you. Once verified, your exact price appears, and our team takes it from there."*
6. *"Sealed, tracked and delivered — before you even land. Book your pickup today, at bagdrop dot co."*

Captions are burned into the video for every line (verbatim or lightly trimmed for on-screen length), so the video is fully understandable muted.

---

## 5. Branding

- Bagdrop orange **#FF6300** — accent bar, step chips, CTA button, logo mark
- Dark grey **#545454** / medium grey **#747474** — labels, secondary text
- Real logo assets used unmodified (`logo-icon.png`, `bagdrop-logo.png` from the site's own `/public/images`)
- No stock footage, no unrelated imagery — every visual is either a real captured screenshot of bagdrop.co/new-website or a branded title/CTA card built from the same colors, logo and typography system as the live site

---

## 6. Stretch goal not completed

A 9:16 vertical cut was **not produced** — the 16:9 horizontal export was prioritized per the brief, and time did not allow a second full re-edit for vertical framing. The 16:9 master can be re-cropped/re-cut for 9:16 in a follow-up pass if needed.
