/** Server-only: the airline-style field flows behind the driver page.
 *
 *  PICKUP CHECK-IN (captain, pickup leg) — per bag, like a check-in desk:
 *   scan the bag's tag (plate or route code) · scan the seal printed for
 *   that bag · weight in kg (over 32 kg must be confirmed → HEAVY sticker)
 *   · a photo. Then the customer signs on the captain's phone. Completing
 *   check-in scans every tag for "Picked up & sealed" and sets the status —
 *   refused while Aadhaar verification is pending (the pickup gate).
 *
 *  DELIVERY CLAIM CHECK (captain, last-mile leg) — like baggage claim:
 *   scan the customer's Move Pass (QR / PDF417) · scan every bag tag ·
 *   the customer reads out a 6-digit delivery OTP sent to their phone.
 *   Only when all three match is POD recorded.
 *  Every write is compare-and-swap (mutateBooking). */
import { createHash, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { HEAVY_KG, bagForScan, parseSeal, spaced, type BagRecord } from "./bagTags";
import { RECEIVER_RELATIONS, opsOf, type OpsState } from "./opsModel";
import { refFromPassScan } from "./movePass";
import type { Booking } from "./types";
import { requiredSecret } from "./secrets";
import { allPieces, bjOn, custodyEvent, withCustody } from "./custody";
import { airportOf, untaggedPieces } from "./airportPoc";
import { AADHAAR_REQUIRED } from "./phase";

export type FieldResult = { ok: true; booking: Booking; note?: string } | { ok: false; error: string; detail: string };
const fail = (error: string, detail: string): FieldResult => ({ ok: false, error, detail });
const SECRET = requiredSecret("QUOTE_SIGNING_SECRET", "dev-secret-change-me");
export const PHOTO_BUCKET = "bag-photos";
const OTP_TTL_MS = 30 * 60_000, OTP_GAP_MS = 60_000, OTP_MAX_TRIES = 5, OTP_MAX_SENDS = 5;
const otpHash = (id: string, otp: string) => createHash("sha256").update(`${id}|${otp}|${SECRET}`).digest("hex");

/** Apply a change to one booking; a refusal from inside the change wins. */
async function change(sb: SupabaseClient, id: string, fn: (b: Booking, o: OpsState) => { next: Booking } | { error: string; detail: string }): Promise<FieldResult> {
  const out: { refusal?: { error: string; detail: string } } = {};
  const next = await mutateBooking(sb, id, (b) => {
    out.refusal = undefined;
    const r = fn(b, opsOf(b));
    if ("error" in r) { out.refusal = r; return null; }
    return r.next;
  });
  if (out.refusal) return fail(out.refusal.error, out.refusal.detail);
  if (!next) return fail("NOT_SAVED", "The booking changed at the same moment — try again.");
  return { ok: true, booking: next };
}
const withOps = (b: Booking, ops: OpsState, extra: Partial<Booking> = {}, event?: string): Booking => ({
  ...b, ...extra, admin: { ...b.admin, ops },
  events: event ? [...b.events, { at: new Date().toISOString(), by: "admin" as const, text: event }] : b.events,
});

/* ---------------- pickup check-in ---------------- */
export function checkInBag(sb: SupabaseClient, id: string, captain: string, a: { n: number; tag: string; seal: string; weightKg: number; heavyOk?: boolean }) {
  return change(sb, id, (b, o) => {
    if (o.milestones?.picked) return { error: "ALREADY_PICKED", detail: "This pickup is already complete." };
    const bags = o.bags ?? [];
    const bag = bags.find((x) => x.n === a.n);
    if (!bag) return { error: "NO_TAG", detail: `Piece ${a.n} has no tag yet — print the tags first.` };
    const scanned = bagForScan(bags, a.tag);
    if (!scanned) return { error: "TAG_UNKNOWN", detail: "That tag doesn't belong to this booking." };
    if (scanned.n !== a.n) return { error: "WRONG_BAG", detail: `That's the tag for piece ${scanned.n}, not piece ${a.n}.` };
    const seal = parseSeal(a.seal);
    if (!seal?.valid) return { error: "SEAL_INVALID", detail: "That seal number fails its check digit — scan it again." };
    if (seal.canon !== bag.seal) return { error: "SEAL_MISMATCH", detail: `Seal ${spaced(seal.canon)} isn't the seal printed for piece ${a.n} (${bag.seal ? spaced(bag.seal) : "none"}).` };
    const w = Math.round(Number(a.weightKg) * 10) / 10;
    if (!Number.isFinite(w) || w < 0.5 || w > 99) return { error: "BAD_WEIGHT", detail: "Enter the weight in kg (0.5 – 99)." };
    if (w > HEAVY_KG && !a.heavyOk) return { error: "HEAVY_CONFIRM", detail: `${w} kg is over ${HEAVY_KG} kg — confirm, and stick the HEAVY sticker on it.` };
    const now = new Date().toISOString();
    const nextBags: BagRecord[] = bags.map((x) => (x.n === a.n ? { ...x, weightKg: w, checkedInAt: now } : x));
    return { next: withOps(b, { ...o, bags: nextBags }, {}, `Check-in · piece ${a.n}/${bags.length} ${spaced(bag.plate)}${bag.xl ? " XL" : ""} · ${w} kg${w > HEAVY_KG ? " HEAVY" : ""} · seal ${spaced(seal.canon)} · by ${captain}`) };
  });
}

export async function savePhoto(sb: SupabaseClient, id: string, n: number, file: File): Promise<FieldResult> {
  if (!file.type.startsWith("image/")) return fail("NOT_IMAGE", "Send a photo.");
  if (file.size > 8 * 1024 * 1024) return fail("TOO_BIG", "Photo is over 8 MB — retake it at a lower resolution.");
  await sb.storage.createBucket(PHOTO_BUCKET, { public: false }).catch(() => null); // exists already → ignored
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${id}/piece-${n}-${Date.now()}.${ext}`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) return fail("UPLOAD_FAILED", up.error.message);
  return change(sb, id, (b, o) => {
    if (!o.bags?.some((x) => x.n === n)) return { error: "NO_TAG", detail: `Piece ${n} has no tag.` };
    return { next: withOps(b, { ...o, bags: o.bags.map((x) => (x.n === n ? { ...x, photo: path } : x)) }) };
  });
}

/** The delivery photo (bags handed over), stored before the claim check completes. */
export async function savePodPhoto(sb: SupabaseClient, id: string, file: File): Promise<FieldResult> {
  if (!file.type.startsWith("image/")) return fail("NOT_IMAGE", "Send a photo.");
  if (file.size > 8 * 1024 * 1024) return fail("TOO_BIG", "Photo is over 8 MB — retake it at a lower resolution.");
  await sb.storage.createBucket(PHOTO_BUCKET, { public: false }).catch(() => null);
  const path = `${id}/pod-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) return fail("UPLOAD_FAILED", up.error.message);
  return change(sb, id, (b, o) => {
    if (o.milestones?.pod) return { error: "ALREADY_DELIVERED", detail: "Already delivered." };
    if (!o.milestones?.arrive) return { error: "NOT_ARRIVED", detail: "The bags haven't been scanned in at the destination hub yet." };
    return { next: withOps(b, { ...o, claim: { ...o.claim, photo: path } }) };
  });
}

/** A signature drawn on screen (PNG data URL) → stored; null when it isn't a real signature. */
async function storeSignature(sb: SupabaseClient, id: string, dataUrl: string, kind: string): Promise<{ path: string } | { error: string; detail: string }> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!m || m[1].length < 400) return { error: "NO_SIGNATURE", detail: "Ask them to sign in the box." };
  const png = Buffer.from(m[1], "base64");
  if (png.length > 400_000) return { error: "SIGNATURE_TOO_BIG", detail: "Signature image is too large." };
  await sb.storage.createBucket(PHOTO_BUCKET, { public: false }).catch(() => null);
  const path = `${id}/${kind}-${Date.now()}.png`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, png, { contentType: "image/png" });
  if (up.error) return { error: "UPLOAD_FAILED", detail: up.error.message };
  return { path };
}

export interface PickupDetail { captain?: string; vehicle?: string; at?: string; note?: string }
export async function completePickup(sb: SupabaseClient, id: string, captain: string, signaturePng: string, entry: "ops" | "captain" = "captain", detail: PickupDetail = {}): Promise<FieldResult> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(signaturePng ?? "");
  if (!m || m[1].length < 400) return fail("NO_SIGNATURE", "Ask the customer to sign in the box.");
  const png = Buffer.from(m[1], "base64");
  if (png.length > 400_000) return fail("SIGNATURE_TOO_BIG", "Signature image is too large.");
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b0 = data?.doc as Booking | undefined;
  if (!b0) return fail("NOT_FOUND", "Booking not found.");
  const pending = (opsOf(b0).bags ?? []).filter((x) => !x.checkedInAt || !x.photo);
  if (!(opsOf(b0).bags ?? []).length || pending.length) return fail("BAGS_PENDING", `Check in every bag first (tag, seal, weight and photo) — ${pending.length} to go.`);
  await sb.storage.createBucket(PHOTO_BUCKET, { public: false }).catch(() => null);
  const sigPath = `${id}/signature-${Date.now()}.png`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(sigPath, png, { contentType: "image/png" });
  if (up.error) return fail("UPLOAD_FAILED", up.error.message);
  return change(sb, id, (b, o) => {
    if (o.milestones?.picked) return { error: "ALREADY_PICKED", detail: "This pickup is already complete." };
    if (AADHAAR_REQUIRED && !b.identity?.ok) return { error: "IDENTITY_NOT_VERIFIED", detail: `Aadhaar verification is pending for ${b.id} — pickup stays locked until the customer completes /verify/${b.id}.` };
    if (!o.milestones?.lr) return { error: "NO_LR", detail: "The LR isn't issued yet — ask the hub to issue it before pickup." };
    const bags = o.bags ?? [];
    if (bags.length !== b.bags + b.oversize) return { error: "COUNT_MISMATCH", detail: `The booking has ${b.bags + b.oversize} piece(s) but ${bags.length} tag(s) — ask the hub to update the booking.` };
    if (bags.some((x) => !x.checkedInAt || !x.photo)) return { error: "BAGS_PENDING", detail: "Check in every bag first." };
    const ap = airportOf(b);
    const untagged = ap.enrolled && (ap.lane === "A" || ap.lane === "D") ? untaggedPieces(ap, bags.length) : [];
    if (untagged.length) return { error: "AIRLINE_TAGS_PENDING", detail: `T2 departure: link the airline tag printed at the Flexbox to piece(s) ${untagged.join(", ")} before leaving.` };
    const now = new Date().toISOString();
    const ops: OpsState = {
      ...o,
      milestones: { ...o.milestones, ...(o.milestones?.assign ? {} : { assign: { at: now, by: captain } }), picked: { at: now, by: captain, entry, note: "check-in: tag, seal, weight, photo per bag · customer signed", detail: Object.fromEntries(Object.entries({ captain: detail.captain ?? captain, vehicle: detail.vehicle, at: detail.at, note: detail.note }).filter(([, v]) => v)) as Record<string, string> } },
      scans: { ...o.scans, picked: bags.map((x) => x.code) },
      checkin: { at: now, by: captain, signature: sigPath, bags: bags.length },
    };
    const kg = Math.round(bags.reduce((a, x) => a + (x.weightKg ?? 0), 0) * 10) / 10;
    const accept = custodyEvent({ at: now, code: "ACCEPT", pieces: allPieces(b), place: `Pickup · ${b.from}`, by: `captain ${captain}`,
      seals: bags.flatMap((x) => (x.seal ? [x.seal] : [])), note: `check-in: tag, seal, weight and photo per bag · customer signed` }, bjOn(b));
    return { next: withCustody(withOps(b, ops, { status: "picked_up" }, `Picked up & sealed · ${bags.length} piece(s), ${kg} kg · every tag and seal scanned · customer signed · ${entry === "ops" ? "entered by ops" : "captain"} ${captain}`), [accept]) };
  });
}

/* ---------------- delivery claim check ---------------- */
export function claimPass(sb: SupabaseClient, id: string, scan: string) {
  return change(sb, id, (b, o) => {
    const ref = refFromPassScan(scan);
    if (!ref) return { error: "NOT_A_PASS", detail: "That isn't a Bagdrop Move Pass code." };
    if (ref !== b.id) return { error: "WRONG_PASS", detail: `That pass is for ${ref}, not ${b.id}.` };
    return { next: withOps(b, { ...o, claim: { ...o.claim, passAt: new Date().toISOString() } }) };
  });
}
export function claimBag(sb: SupabaseClient, id: string, scan: string) {
  return change(sb, id, (b, o) => {
    const bag = bagForScan(o.bags ?? [], scan);
    if (!bag) return { error: "TAG_UNKNOWN", detail: "That tag doesn't belong to this booking — don't hand it over." };
    const scanned = [...new Set([...(o.claim?.scanned ?? []), bag.plate])];
    return { next: withOps(b, { ...o, claim: { ...o.claim, scanned } }) };
  });
}
/** Returns the OTP so the caller can send it; only its hash is stored. */
export async function newDeliveryOtp(sb: SupabaseClient, id: string): Promise<FieldResult & { otp?: string }> {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const r = await change(sb, id, (b, o) => {
    const c = o.claim ?? {};
    if (!o.milestones?.arrive) return { error: "NOT_ARRIVED", detail: "The bags haven't been scanned in at the destination hub yet." };
    if (c.otpAt && Date.now() - Date.parse(c.otpAt) < OTP_GAP_MS) return { error: "WAIT", detail: "An OTP was just sent — wait a minute before resending." };
    const sends = (c.sends ?? 0) + 1;
    if (sends > OTP_MAX_SENDS) return { error: "TOO_MANY", detail: "Too many OTPs sent — call the Bagdrop team." };
    return { next: withOps(b, { ...o, claim: { ...c, otpHash: otpHash(b.id, otp), otpAt: new Date().toISOString(), tries: 0, sends } }) };
  });
  return r.ok ? { ...r, otp } : r;
}
export interface PodInput { otp: string; receiver: string; relation: string; signature: string }
export async function completeDelivery(sb: SupabaseClient, id: string, captain: string, p: PodInput, entry: "ops" | "captain" = "captain"): Promise<FieldResult> {
  const receiver = String(p.receiver ?? "").trim(), relation = String(p.relation ?? "").trim();
  /* check in journey order, before anything is stored: pass → every bag → OTP sent → photo → receiver → signature */
  {
    const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
    const b0 = data?.doc as Booking | undefined;
    if (!b0) return fail("NOT_FOUND", "Booking not found.");
    const o0 = opsOf(b0), c0 = o0.claim ?? {}, bags0 = o0.bags ?? [];
    if (o0.milestones?.pod) return fail("ALREADY_DELIVERED", "Already delivered.");
    if (!o0.milestones?.arrive) return fail("NOT_ARRIVED", "The bags haven't been scanned in at the destination hub yet.");
    if (!c0.passAt) return fail("PASS_NOT_SCANNED", "Scan the customer's Move Pass first.");
    const missing0 = bags0.filter((x) => !(c0.scanned ?? []).includes(x.plate));
    if (!bags0.length || missing0.length) return fail("BAGS_NOT_SCANNED", `Scan every bag — ${missing0.map((x) => `${x.n}${x.xl ? " XL" : ""}`).join(", ") || "none tagged"} still to go.`);
    if (!c0.otpHash || !c0.otpAt) return fail("NO_OTP", "Send the delivery OTP to the customer first.");
    if (!c0.photo) return fail("NO_POD_PHOTO", "Take a photo of the bags being handed over.");
  }
  if (receiver.length < 2) return fail("NO_RECEIVER", "Enter the name of the person taking the bags.");
  if (!RECEIVER_RELATIONS.includes(relation as (typeof RECEIVER_RELATIONS)[number])) return fail("NO_RELATION", "Pick how the receiver is related to the traveller.");
  const sig = await storeSignature(sb, id, p.signature, "pod-signature");
  if ("error" in sig) return fail(sig.error, sig.detail);
  const otp = p.otp;
  /* a wrong OTP must be saved (one more try used) AND reported as a failure */
  const wrong: { left?: number } = {};
  const r = await change(sb, id, (b, o) => {
    wrong.left = undefined;
    const c = o.claim ?? {};
    const bags = o.bags ?? [];
    if (o.milestones?.pod) return { error: "ALREADY_DELIVERED", detail: "Already delivered." };
    if (!o.milestones?.arrive) return { error: "NOT_ARRIVED", detail: "The bags haven't been scanned in at the destination hub yet." };
    if (!c.passAt) return { error: "PASS_NOT_SCANNED", detail: "Scan the customer's Move Pass first." };
    const missing = bags.filter((x) => !(c.scanned ?? []).includes(x.plate));
    if (!bags.length || missing.length) return { error: "BAGS_NOT_SCANNED", detail: `Scan every bag — ${missing.map((x) => `${x.n}${x.xl ? " XL" : ""}`).join(", ") || "none tagged"} still to go.` };
    if (!c.otpHash || !c.otpAt) return { error: "NO_OTP", detail: "Send the delivery OTP to the customer first." };
    if (Date.now() - Date.parse(c.otpAt) > OTP_TTL_MS) return { error: "OTP_EXPIRED", detail: "The OTP has expired — send a new one." };
    if ((c.tries ?? 0) >= OTP_MAX_TRIES) return { error: "OTP_LOCKED", detail: "Too many wrong OTPs — send a new one." };
    if (otpHash(b.id, String(otp ?? "").trim()) !== c.otpHash) {
      const tries = (c.tries ?? 0) + 1;
      wrong.left = OTP_MAX_TRIES - tries;
      return { next: withOps(b, { ...o, claim: { ...c, tries } }) };
    }
    const now = new Date().toISOString();
    const ops: OpsState = {
      ...o,
      milestones: { ...o.milestones, ...(o.milestones?.ofd ? {} : { ofd: { at: now, by: captain, entry } }), pod: { at: now, by: captain, entry, note: "pass + every tag + OTP + photo + signature", detail: { receiver, relation } } },
      scans: { ...o.scans, pod: bags.map((x) => x.code) },
      claim: { ...c, otpHash: undefined, doneAt: now },
    };
    const podEv = custodyEvent({ at: now, code: "POD", pieces: allPieces(b), place: `Delivery · ${b.to}`, by: `captain ${captain}`, note: `Move Pass + every tag + OTP · received by ${receiver} (${relation})` }, bjOn(b));
    if (!c.photo) return { error: "NO_POD_PHOTO", detail: "Take a photo of the bags being handed over." };
    return { next: withCustody(withOps(b, ops, { status: "delivered", pod: { no: `POD-${b.id}`, at: now, receiver, relation, photo: c.photo, signature: sig.path, by: captain } }, `Delivered · Move Pass scanned · all ${bags.length} tag(s) matched · OTP verified · photo taken · received by ${receiver} (${relation}), signed · ${entry === "ops" ? "entered by ops" : "captain"} ${captain}`), [podEv]) };
  });
  if (r.ok && wrong.left !== undefined) return fail("OTP_WRONG", wrong.left > 0 ? `Wrong OTP — ${wrong.left} tr${wrong.left === 1 ? "y" : "ies"} left.` : "Wrong OTP — send a new one.");
  return r;
}

/* ---------------- in-house delivery (recorded by the team, no OTP) ---------------- */
export interface DeskDeliveryInput { receiver: string; relation: string; at?: string; note?: string; captain?: string }
/** Phase 1: the team records the delivery from Operations — who took the bags,
 *  when, with a handover photo when there is one. Every tag counts as handed
 *  over; the POD is stamped like a captain's. */
export async function recordDelivery(sb: SupabaseClient, id: string, by: string, p: DeskDeliveryInput): Promise<FieldResult> {
  const receiver = String(p.receiver ?? "").trim(), relation = String(p.relation ?? "").trim();
  if (receiver.length < 2) return fail("NO_RECEIVER", "Enter the name of the person who took the bags.");
  if (!RECEIVER_RELATIONS.includes(relation as (typeof RECEIVER_RELATIONS)[number])) return fail("NO_RELATION", "Pick how the receiver is related to the traveller.");
  const when = p.at && Number.isFinite(Date.parse(p.at)) ? new Date(p.at).toISOString() : new Date().toISOString();
  if (Date.parse(when) > Date.now() + 10 * 60_000) return fail("FUTURE_TIME", "The delivery time can't be in the future.");
  return change(sb, id, (b, o) => {
    if (o.milestones?.pod) return { error: "ALREADY_DELIVERED", detail: "Already delivered." };
    if (!o.milestones?.arrive) return { error: "NOT_ARRIVED", detail: "Record the arrival at the destination hub first." };
    const bags = o.bags ?? [];
    const captain = p.captain?.trim() || o.legs?.lastmile?.assignee || by;
    const ops: OpsState = {
      ...o,
      milestones: { ...o.milestones, ...(o.milestones?.ofd ? {} : { ofd: { at: when, by, entry: "ops" } }), pod: { at: when, by, entry: "ops", note: "recorded by the team", detail: { receiver, relation, captain, ...(p.note?.trim() ? { note: p.note.trim() } : {}) } } },
      scans: { ...o.scans, pod: bags.map((x) => x.code) },
      claim: { ...o.claim, scanned: bags.map((x) => x.plate), doneAt: when },
    };
    const pod: Booking["pod"] = { no: `POD-${b.id}`, at: when, receiver, relation, photo: o.claim?.photo, by: captain };
    return { next: withOps(b, ops, { status: "delivered", pod }, `Delivered · received by ${receiver} (${relation})${o.claim?.photo ? " · photo on file" : ""} · captain ${captain} · recorded by ${by}`) };
  });
}
