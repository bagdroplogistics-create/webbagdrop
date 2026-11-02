/** Server-only: issue licence plates and security seals for a booking's
 *  pieces. Serials come from the database's atomic counter (next_doc_no,
 *  one sequence per hub: TAG-BDQ, SEAL-BDQ …), so two people printing at
 *  the same moment can never get the same number. Issuing is idempotent:
 *  pieces that already have a record keep it; only missing pieces (new or
 *  added bags) get numbers. A number allocated but lost to a write race is
 *  simply skipped — gaps are fine, duplicates are impossible. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutateBooking } from "./bookingStore";
import { generateTags, opsOf, type OpsState } from "./opsModel";
import { hubOf, missingPieces, plateOf, sealOf, type BagRecord, type UserSticker } from "./bagTags";
import { isTrackable } from "./tracking";
import type { Booking } from "./types";

async function nextSerial(sb: SupabaseClient, seq: string): Promise<number> {
  const { data, error } = await sb.rpc("next_doc_no", { p_type: seq, p_fy: "ALL" });
  if (error) throw new Error(error.message);
  const n = Number(/(\d+)$/.exec(String(data))?.[1]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`bad serial from ${seq}: ${data}`);
  if (n > 999_999) throw new Error(`${seq} has run past 999999 — roll the series before issuing more`);
  return n;
}

export type IssueResult = { booking: Booking; issued: number } | { error: string; detail: string; status: number };

export async function issueTags(sb: SupabaseClient, id: string, by: string): Promise<IssueResult> {
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b0 = data?.doc as Booking | undefined;
  if (!b0) return { error: "NOT_FOUND", detail: `${id} not found.`, status: 404 };
  if (!isTrackable(b0) || ["delivered", "cancelled", "rejected"].includes(b0.status)) {
    return { error: "NOT_CONFIRMED", detail: `Tags are issued only for confirmed (approved + paid) moves — ${id} is "${b0.status}".`, status: 409 };
  }
  const need = missingPieces(b0, opsOf(b0).bags ?? []);
  const hub = hubOf(b0.from);
  const fresh: { plate: string; seal: string }[] = [];
  for (let i = 0; i < need.length; i++) {
    fresh.push({ plate: plateOf(hub, await nextSerial(sb, `TAG-${hub}`)), seal: sealOf(hub, await nextSerial(sb, `SEAL-${hub}`)) });
  }
  const now = new Date().toISOString();
  let issued = 0;
  const next = await mutateBooking(sb, id, (b) => {
    const o = opsOf(b);
    const total = b.bags + b.oversize;
    /* drop records for pieces that no longer exist (bags removed), unless already checked in */
    const keep = (o.bags ?? []).filter((x) => x.n <= total || x.checkedInAt);
    const missing = missingPieces(b, keep);
    const codes = generateTags(b, total);
    const pool = [...fresh];
    const added: BagRecord[] = missing.slice(0, pool.length).map((m) => {
      const num = pool.shift()!;
      return { n: m.n, plate: num.plate, code: codes[m.n - 1], xl: m.xl, seal: num.seal };
    });
    issued = added.length;
    const bags = [...keep, ...added].sort((a, z) => a.n - z.n);
    const ops: OpsState = { ...o, bags, tags: codes, printedAt: o.printedAt ?? now };
    return {
      ...b, admin: { ...b.admin, ops },
      events: added.length ? [...b.events, { at: now, by: "admin" as const, text: `🏷 ${added.length} bag tag(s) + seal(s) issued by ${by}: ${added.map((x) => `${x.plate}${x.xl ? " XL" : ""}`).join(", ")}` }] : b.events,
    };
  });
  if (!next) return { error: "NOT_SAVED", detail: "The booking changed while issuing — try again (no numbers were reused).", status: 409 };
  return { booking: next, issued };
}

export async function setStickers(sb: SupabaseClient, id: string, n: number, stickers: UserSticker[]): Promise<Booking | null> {
  const allowed: UserSticker[] = ["FRAGILE", "PRIORITY", "UP"];
  const clean = [...new Set(stickers)].filter((s) => allowed.includes(s));
  return mutateBooking(sb, id, (b) => {
    const o = opsOf(b);
    if (!o.bags?.some((x) => x.n === n)) return null;
    return { ...b, admin: { ...b.admin, ops: { ...o, bags: o.bags.map((x) => (x.n === n ? { ...x, stickers: clean } : x)) } } };
  });
}
