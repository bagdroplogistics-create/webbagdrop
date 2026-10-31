import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { serviceClient } from "@/lib/supabaseAdmin";
import { isPaid } from "@/lib/payState";
import { checkOtp, cleanEmail, cleanMobile, issueOtp } from "@/lib/otp";
import { kickSweep, notify, opsNotify, sendEmail, sendWhatsApp } from "@/lib/automation";
import { INDEMNITY_VERSION, REQUIRED_IDS, bondText, validAadhaar } from "@/lib/indemnity";
import type { Booking } from "@/lib/types";
import { DEMO_ALLOWED } from "@/lib/demoMode";

/** Pre-pickup identity + indemnity bond (steps 6–7 of the booking flow).
 *  Reachable only once money is settled (finance-verified payment, partner
 *  capture or host billing). The booking id in the link is the bearer key,
 *  as on /verify; everything that changes state needs a second factor:
 *   · domestic      — Aadhaar number (Verhoeff-checked) + UIDAI OTP
 *                     (demo code on localhost until a licensed eSign/ESP is
 *                     connected; refused on a live deployment until then);
 *                     3 wrong codes lock it until staff unlock.
 *   · international — passport + visa uploads (private bucket, content-
 *                     sniffed, ≤5 MB, max 3 submissions) reviewed by the
 *                     team, then a signature by OTP to the booking's own
 *                     email (mobile when there is no email).
 *  Only a masked ID tail is kept. Signing stores the bond version, the
 *  SHA-256 of the agreed text and every ticked box. Any problem alerts
 *  both the client and the BAGDROP OS compliance desk. */

const DEMO_AADHAAR_OTP = process.env.AADHAAR_DEMO_OTP ?? "112233";
const MAX_ATTEMPTS = 3;
const MAX_SUBMISSIONS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "identity-docs";
const TEXT_HASH = createHash("sha256").update(bondText()).digest("hex");

const settled = (b: Booking) => isPaid(b) || !!b.payer;
const ESIGN_OFF = () => NextResponse.json({ error: "ESIGN_NOT_LIVE", detail: "Aadhaar e-signing isn't switched on yet. Our team will call you to complete verification before pickup." }, { status: 503 });
const OTP_OFF = () => NextResponse.json({ error: "OTP_NOT_CONFIGURED", detail: "We can't send your signing code right now. Our team will call you to complete it before pickup." }, { status: 503 });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const mask = (s?: string) => (s ? s.replace(/.(?=.{3})/g, "•") : "");

function sniff(buf: Buffer): { ext: string; type: string } | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: "png", type: "image/png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (buf.length > 5 && buf.toString("ascii", 0, 5) === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  return null;
}

function view(b: Booking) {
  const admin = b.admin as { aadhaarAttempts?: number; aadhaarLocked?: boolean };
  return {
    id: b.id, from: b.from, to: b.to, date: b.date, slot: b.slot, bags: b.bags, oversize: b.oversize,
    name: b.traveller.name, mobile: mask(b.traveller.mobile), email: b.traveller.email ? mask(b.traveller.email.split("@")[0]) + "@" + b.traveller.email.split("@")[1] : "",
    settled: settled(b), verified: !!b.identity?.ok, signed: !!b.indemnity?.textHash,
    signedAt: b.indemnity?.acceptedAt ?? null, method: b.identity?.ok ? b.identity.method : null,
    locked: !!admin.aadhaarLocked, attemptsLeft: Math.max(0, MAX_ATTEMPTS - (admin.aadhaarAttempts ?? 0)),
    kyc: b.kyc ? { kind: b.kyc.kind, status: b.kyc.status, note: b.kyc.note ?? null, submissions: b.kyc.submissions ?? 0 } : null,
    version: INDEMNITY_VERSION,
  };
}

async function load(id: string) {
  const sb = serviceClient()!;
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  return data ? (data.doc as Booking) : null;
}
async function save(b: Booking) {
  const sb = serviceClient()!;
  return saveOrThrow(sb, b);
}
const ev = (text: string, by: "customer" | "admin" = "customer") => ({ at: new Date().toISOString(), by, text });

/** a signing problem → the client and the compliance desk both hear about it */
async function issue(b: Booking, clientText: string, opsText: string, key: string) {
  await notify("kyc_issue", { name: b.traveller.name, mobile: b.traveller.mobile, email: b.traveller.email },
    { ref: b.id, note: clientText, link: `/verify/${b.id}` }, `kycissue:${b.id}:${key}`);
  await opsNotify(`🛂 COMPLIANCE ISSUE · ${b.id} · ${b.traveller.name} · ${opsText} — open BAGDROP OS → Identity & compliance.`, `Compliance issue · ${b.id}`, `ops:kycissue:${b.id}:${key}`);
}

function checkBoxes(accepted: unknown): string[] | null {
  const list = Array.isArray(accepted) ? accepted.filter((x): x is string => typeof x === "string") : [];
  return REQUIRED_IDS.every((id) => list.includes(id)) ? Array.from(new Set(list)).slice(0, 40) : null;
}

/** shared final step: bond stored, identity released, pickup unlocked */
async function sign(b: Booking, o: { accepted: string[]; fragile: string; signature: string; place: string; idType: "aadhaar" | "passport"; idTail: string; method: "aadhaar_otp" | "email_otp" | "mobile_otp"; identityMethod: string }) {
  const now = new Date().toISOString();
  const next: Booking = {
    ...b,
    indemnity: {
      acceptedAt: now, idType: o.idType, idNumber: `XXXX-${o.idTail.slice(-4).toUpperCase()}`, signature: o.signature, place: o.place || undefined,
      version: INDEMNITY_VERSION, textHash: TEXT_HASH, accepted: o.accepted, fragile: o.fragile || undefined, method: o.method,
    },
    identity: { ok: true, at: now, method: o.identityMethod, score: 0.97 },
    kyc: { ...(b.kyc ?? { kind: o.idType === "aadhaar" ? "domestic" : "international" }), status: "signed" },
    admin: { ...b.admin, aadhaarAttempts: undefined, aadhaarLocked: undefined },
    events: [...b.events, ev(`🛂 Indemnity bond v${INDEMNITY_VERSION} SIGNED by "${o.signature}" · ${o.idType} XXXX-${o.idTail.slice(-4).toUpperCase()} · ${o.identityMethod}${o.fragile ? ` · declared: ${o.fragile}` : ""} — identity verified, pickup released`)],
  };
  const up = await save(next);
  if (up.error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  await opsNotify(`✅ Verified & ready for pickup · ${b.id} · ${b.traveller.name} · bond signed (${o.method === "aadhaar_otp" ? "Aadhaar OTP" : "documents + OTP"}) · ${b.from} → ${b.to} on ${b.date} — assign a captain.`,
    `Ready for pickup · ${b.id}`, `ops:signed:${b.id}`);
  kickSweep(); // sends identity_done to the client
  return NextResponse.json({ ok: true, booking: view(next) });
}

export async function GET(req: Request) {
  if (!serviceClient()) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id")?.trim().toUpperCase();
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  const b = await load(id);
  if (!b) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ booking: view(b) });
}

async function handlePOST(req: Request) {
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  /* ---------- international: document upload (multipart) ---------- */
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const b = await load(String(form.get("id") ?? "").trim().toUpperCase());
    if (!b) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!settled(b)) return NextResponse.json({ error: "PAYMENT_NOT_VERIFIED", detail: "Identity checks open once your payment is verified." }, { status: 409 });
    if (b.identity?.ok) return NextResponse.json({ error: "ALREADY_VERIFIED" }, { status: 409 });
    if (b.kyc?.status === "docs_submitted") return NextResponse.json({ error: "UNDER_REVIEW", detail: "Your documents are with our team for review." }, { status: 409 });
    if ((b.kyc?.submissions ?? 0) >= MAX_SUBMISSIONS) return NextResponse.json({ error: "TOO_MANY", detail: "Please contact the Bagdrop team on WhatsApp to finish verification." }, { status: 429 });
    const nationality = str(form.get("nationality"), 40), passportNo = str(form.get("passportNo"), 20).replace(/[^0-9A-Za-z]/g, "");
    const indiaAddress = str(form.get("indiaAddress"), 200);
    if (!nationality || passportNo.length < 6 || indiaAddress.length < 8) return NextResponse.json({ error: "MISSING_FIELDS", detail: "Nationality, passport number and your address in India are needed." }, { status: 400 });

    const files: { kind: "passport" | "visa"; file: File }[] = [];
    for (const kind of ["passport", "visa"] as const) {
      const f = form.get(kind);
      if (f instanceof File && f.size > 0) files.push({ kind, file: f });
    }
    if (!files.some((f) => f.kind === "passport")) return NextResponse.json({ error: "NEED_PASSPORT", detail: "Upload the photo page of your passport." }, { status: 400 });
    if (!files.some((f) => f.kind === "visa")) return NextResponse.json({ error: "NEED_VISA", detail: "Upload your visa, e-visa or OCI card." }, { status: 400 });

    await sb.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
    const docs: NonNullable<NonNullable<Booking["kyc"]>["docs"]> = [];
    for (const { kind, file } of files) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "TOO_LARGE", detail: "Each file can be up to 5 MB." }, { status: 413 });
      const buf = Buffer.from(await file.arrayBuffer());
      const t = sniff(buf);
      if (!t) return NextResponse.json({ error: "BAD_FILE", detail: "Only PNG, JPG, WEBP images or PDF files are accepted." }, { status: 415 });
      const path = `${b.id}/${kind}-${Date.now()}-${randomBytes(6).toString("hex")}.${t.ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: t.type, upsert: false });
      if (up.error) return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });
      docs.push({ path, kind, name: file.name.slice(0, 80), at: new Date().toISOString() });
    }
    const next: Booking = {
      ...b,
      kyc: { kind: "international", status: "docs_submitted", nationality, passportNo: `XXXX-${passportNo.slice(-4).toUpperCase()}`, indiaAddress, docs: [...(b.kyc?.docs ?? []), ...docs], submissions: (b.kyc?.submissions ?? 0) + 1 },
      events: [...b.events, ev(`🛂 International guest documents submitted (${nationality}, passport XXXX-${passportNo.slice(-4).toUpperCase()}) — awaiting team review`)],
    };
    const up = await save(next);
    if (up.error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
    await opsNotify(`🛂 Documents to review · ${b.id} · ${b.traveller.name} · ${nationality} passport + visa uploaded — verify in BAGDROP OS → Identity & compliance before pickup on ${b.date}.`,
      `Documents to review · ${b.id}`, `ops:kycdocs:${b.id}:${next.kyc!.submissions}`);
    return NextResponse.json({ ok: true, booking: view(next) });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const b = await load(str(body.id, 40).toUpperCase());
  if (!b) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!settled(b)) return NextResponse.json({ error: "PAYMENT_NOT_VERIFIED", detail: "Identity checks open once your payment is verified." }, { status: 409 });
  if (b.identity?.ok && b.indemnity?.textHash) return NextResponse.json({ ok: true, booking: view(b) }); // idempotent
  const admin = b.admin as { aadhaarAttempts?: number; aadhaarLocked?: boolean };

  /* ---------- domestic step 1: request the Aadhaar OTP ---------- */
  if (body.action === "aadhaar_otp") {
    if (!DEMO_ALLOWED) return ESIGN_OFF();
    if (admin.aadhaarLocked) return NextResponse.json({ error: "LOCKED" }, { status: 423 });
    if (!validAadhaar(str(body.aadhaar, 20))) return NextResponse.json({ error: "BAD_AADHAAR", detail: "That isn't a valid 12-digit Aadhaar number." }, { status: 400 });
    /* UIDAI sends the OTP to the Aadhaar-linked mobile. Until a licensed
     * eSign/KUA provider is connected this is the labelled demo code. */
    return NextResponse.json({ ok: true, sent: true, demo: DEMO_AADHAAR_OTP });
  }

  /* ---------- domestic step 2: sign with the Aadhaar OTP ---------- */
  if (body.action === "sign_domestic") {
    if (!DEMO_ALLOWED) return ESIGN_OFF();
    if (admin.aadhaarLocked) return NextResponse.json({ error: "LOCKED" }, { status: 423 });
    const accepted = checkBoxes(body.accepted);
    if (!accepted) return NextResponse.json({ error: "BOXES_REQUIRED", detail: "Please tick every declaration to sign the bond." }, { status: 400 });
    const signature = str(body.signature, 80), place = str(body.place, 60), fragile = str(body.fragile, 300);
    if (signature.length < 3) return NextResponse.json({ error: "NEED_SIGNATURE", detail: "Type your full name as your signature." }, { status: 400 });
    const aadhaar = str(body.aadhaar, 20).replace(/\s|-/g, "");
    if (!validAadhaar(aadhaar)) return NextResponse.json({ error: "BAD_AADHAAR", detail: "That isn't a valid 12-digit Aadhaar number." }, { status: 400 });
    if (str(body.otp, 6) !== DEMO_AADHAAR_OTP) {
      const attempts = (admin.aadhaarAttempts ?? 0) + 1;
      const locked = attempts >= MAX_ATTEMPTS;
      const next: Booking = {
        ...b, admin: { ...b.admin, aadhaarAttempts: attempts, ...(locked ? { aadhaarLocked: true } : {}) },
        events: locked ? [...b.events, ev(`⚠ Aadhaar OTP signing LOCKED after ${MAX_ATTEMPTS} wrong codes — needs staff review`)] : b.events,
      };
      await save(next);
      if (locked) await issue(b, "Your Aadhaar verification was locked after 3 wrong codes. Our team will call you to help finish it before pickup.", `Aadhaar OTP locked after ${MAX_ATTEMPTS} wrong codes (pickup ${b.date})`, "locked");
      return NextResponse.json({ error: locked ? "LOCKED" : "WRONG_OTP", attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) }, { status: locked ? 423 : 401 });
    }
    return sign(b, { accepted, fragile, signature, place, idType: "aadhaar", idTail: aadhaar, method: "aadhaar_otp", identityMethod: "UIDAI Aadhaar OTP eSign (demo until ESP is connected)" });
  }

  /* ---------- international: OTP to the booking's own contact, after review ---------- */
  const contact = () => {
    const email = b.traveller.email ? cleanEmail(b.traveller.email) : null;
    return email ? { to: email, channel: "email" as const } : { to: cleanMobile(b.traveller.mobile), channel: "mobile" as const };
  };
  if (body.action === "intl_otp") {
    if (b.kyc?.kind !== "international" || b.kyc.status !== "docs_approved") return NextResponse.json({ error: "DOCS_NOT_APPROVED", detail: "Our team is still reviewing your documents." }, { status: 409 });
    const c = contact();
    if (!c.to) return NextResponse.json({ error: "NO_CONTACT" }, { status: 409 });
    const { code, exp, token } = issueOtp(c.to);
    const text = `${code} is your Bagdrop signing code for ${b.id}. Valid 10 minutes — never share it.`;
    const res = c.channel === "email" ? await sendEmail(c.to, `${code} is your Bagdrop signing code`, text) : await sendWhatsApp(c.to, text);
    if (res.stub && !DEMO_ALLOWED) return OTP_OFF();
    return NextResponse.json({ ok: true, channel: c.channel, exp, token, ...(res.stub ? { demo: code } : {}) });
  }
  if (body.action === "sign_international") {
    if (b.kyc?.kind !== "international" || b.kyc.status !== "docs_approved") return NextResponse.json({ error: "DOCS_NOT_APPROVED" }, { status: 409 });
    const accepted = checkBoxes(body.accepted);
    if (!accepted) return NextResponse.json({ error: "BOXES_REQUIRED", detail: "Please tick every declaration to sign the bond." }, { status: 400 });
    const signature = str(body.signature, 80), place = str(body.place, 60), fragile = str(body.fragile, 300);
    if (signature.length < 3) return NextResponse.json({ error: "NEED_SIGNATURE", detail: "Type your full name as your signature." }, { status: 400 });
    const o = (body.otp ?? {}) as { code?: string; exp?: number; token?: string };
    const c = contact();
    if (!c.to || !o.code || !o.exp || !o.token || !checkOtp(c.to, String(o.code), Number(o.exp), String(o.token))) {
      return NextResponse.json({ error: "WRONG_OTP", detail: "That code didn't match or has expired — request a new one." }, { status: 401 });
    }
    return sign(b, { accepted, fragile, signature, place, idType: "passport", idTail: b.kyc.passportNo ?? "0000", method: c.channel === "email" ? "email_otp" : "mobile_otp", identityMethod: `Passport + visa verified by team · signed by ${c.channel} OTP` });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}

export const POST = retryOnConflict(handlePOST);
