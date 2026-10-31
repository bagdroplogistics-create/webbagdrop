/** Airline-grade bag identity — licence plates, security seals and the
 *  per-bag record. Pure and shared by the label printer, the Move Pass,
 *  captain check-in, the delivery claim check and Operations scanning.
 *
 *  Licence plate   BD BDQ 004218 7   (printed with spaces)
 *                  BDBDQ0042187      (canonical — what Code 128 encodes)
 *                  = Bagdrop code · origin hub letters · 6-digit per-hub
 *                    serial (issued atomically by next_doc_no) · Luhn digit
 *  Security seal   SL BDQ 001207 4   — same shape, printed on VOID stock
 *  The older route/piece code (BD-BDQ-BOM-7F3K2-5-K, opsModel.generateTags)
 *  stays on every tag as the secondary reference and is still accepted by
 *  every scanner. Pieces are at actuals; oversize pieces are XL and come
 *  last (tag n is XL when n > booking.bags). */
import { isXlPiece, portCode } from "./opsModel";

export const HEAVY_KG = 32;
export type UserSticker = "FRAGILE" | "PRIORITY" | "UP";
export type Sticker = "XL" | "HEAVY" | UserSticker;
export const STICKER_TEXT: Record<Sticker, string> = {
  XL: "XL · OVERSIZE", HEAVY: "HEAVY · LIFT WITH CARE", FRAGILE: "FRAGILE", PRIORITY: "PRIORITY", UP: "THIS WAY UP",
};

export interface BagRecord {
  n: number;              // piece number, 1 … N
  plate: string;          // canonical licence plate, e.g. BDBDQ0042187
  code: string;           // route/piece reference, e.g. BD-BDQ-BOM-7F3K2-5-K
  xl: boolean;
  seal?: string;          // canonical seal number, e.g. SLBDQ0012074
  stickers?: UserSticker[];
  weightKg?: number;      // captured at pickup check-in
  photo?: string;         // storage path of the pickup photo
  checkedInAt?: string;
}

/* ---------------- check digit ---------------- */
/** Luhn over the numeric expansion (A=10 … Z=35, two digits per letter). */
export function luhn(body: string): string {
  const digits = body.toUpperCase().split("").map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55))).join("");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

const HUB = /^[A-Z]{3}$/;
function make(prefix: "BD" | "SL", hub: string, serial: number): string {
  if (!HUB.test(hub)) throw new Error(`bad hub code ${hub}`);
  if (!Number.isInteger(serial) || serial < 1 || serial > 999_999) throw new Error(`serial out of range ${serial}`);
  const body = `${prefix}${hub}${String(serial).padStart(6, "0")}`;
  return body + luhn(body);
}
export const plateOf = (hub: string, serial: number) => make("BD", hub, serial);
export const sealOf = (hub: string, serial: number) => make("SL", hub, serial);

/** "BDBDQ0042187" → "BD BDQ 004218 7" (also for seals). */
export const spaced = (canon: string) => canon.length === 12 ? `${canon.slice(0, 2)} ${canon.slice(2, 5)} ${canon.slice(5, 11)} ${canon.slice(11)}` : canon;

/** Whatever a scanner, a phone camera (QR → URL) or a person typed. */
export function normScan(raw: string): string {
  const s = (raw ?? "").trim().toUpperCase();
  const fromUrl = /\/B\/([A-Z0-9 .-]+)\/?$/.exec(s)?.[1] ?? s;  // tag QR opens /b/<plate>
  return /^BD-[A-Z]{3}-/.test(fromUrl) ? fromUrl.replace(/\s+/g, "") : fromUrl.replace(/[\s.\-]/g, "");
}
function parse(prefix: "BD" | "SL", raw: string) {
  const s = normScan(raw);
  const m = new RegExp(`^${prefix}([A-Z]{3})(\\d{6})(\\d)$`).exec(s);
  if (!m) return null;
  return { canon: s, hub: m[1], serial: Number(m[2]), valid: luhn(`${prefix}${m[1]}${m[2]}`) === m[3] };
}
export const parsePlate = (raw: string) => parse("BD", raw);
export const parseSeal = (raw: string) => parse("SL", raw);

/* ---------------- per-booking helpers ---------------- */
export const hubOf = (city: string) => portCode(city);

export function stickersOf(bag: BagRecord): Sticker[] {
  const s: Sticker[] = [];
  if (bag.xl) s.push("XL");
  if ((bag.weightKg ?? 0) > HEAVY_KG) s.push("HEAVY");
  for (const u of bag.stickers ?? []) if (!s.includes(u)) s.push(u);
  return s;
}

/** Find the bag a scan refers to — by licence plate or by the route code. */
export function bagForScan(bags: BagRecord[], raw: string): BagRecord | null {
  const s = normScan(raw);
  return bags.find((b) => b.plate === s || b.code === s) ?? null;
}

/** Piece numbers that still need a tag record (new or added bags). */
export function missingPieces(b: { bags: number; oversize: number }, bags: BagRecord[]): { n: number; xl: boolean }[] {
  const total = b.bags + b.oversize;
  const have = new Set(bags.map((x) => x.n));
  return Array.from({ length: total }, (_, i) => i + 1).filter((n) => !have.has(n)).map((n) => ({ n, xl: isXlPiece(b, n) }));
}
