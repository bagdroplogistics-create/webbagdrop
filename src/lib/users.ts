/** BAGDROP OS user accounts (server only). One settings row per user,
 *  "user:<id>", status "user". Passwords are scrypt-hashed with a per-user
 *  salt and never leave this file; 5 wrong tries lock the account for 15
 *  minutes. `ver` goes up on a password reset, disable or "sign out
 *  everywhere", which ends every session signed with the old value. Every
 *  change is written to the audit trail ("audit:<time>:<rand>" rows). */
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { serviceClient } from "./supabaseAdmin";
import { isPerm, type Actor, type Perm } from "./access";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
type SB = NonNullable<ReturnType<typeof serviceClient>>;

export interface UserRec {
  id: string; name: string; email: string; mobile: string; dept: string; perms: Perm[];
  status: "active" | "disabled"; pass: string; mustChange: boolean; ver: number;
  failed: number; lockedUntil: string | null; created: string; createdBy: string; lastLogin: string | null; passChanged: string | null;
}
/** What the Users screen gets — never the password hash. */
export type UserView = Omit<UserRec, "pass" | "failed"> & { locked: boolean };
export const viewOf = (u: UserRec): UserView => {
  const { pass: _p, failed: _f, ...rest } = u;
  void _p; void _f;
  return { ...rest, locked: !!u.lockedUntil && Date.parse(u.lockedUntil) > Date.now() };
};

export const LOCK_TRIES = 5, LOCK_MINUTES = 15;

/* ---------------- passwords ---------------- */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scryptAsync(pw, salt, 32);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}
export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, "hex");
  const got = await scryptAsync(pw, Buffer.from(saltHex, "hex"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}
/** Problems with a new password, in plain words; empty means fine. */
export function passwordProblems(pw: string, u: Pick<UserRec, "email" | "mobile" | "name">): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("at least 10 characters");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) out.push("letters and numbers");
  const low = pw.toLowerCase();
  if ([u.email.split("@")[0], u.mobile.slice(-10), u.name.split(" ")[0]].some((x) => x && x.length >= 3 && low.includes(x.toLowerCase()))) out.push("not your name, email or mobile");
  if (/^(.)\1+$/.test(pw) || ["password12", "bagdrop123", "1234567890", "qwertyuiop"].some((w) => low.includes(w))) out.push("not an easy-to-guess password");
  return out;
}

/* ---------------- storage ---------------- */
export const cleanMobileTen = (s: string) => s.replace(/\D/g, "").slice(-10);
export const cleanEmail = (s: string) => s.trim().toLowerCase();

export async function listUsers(sb: SB): Promise<UserRec[]> {
  const { data } = await sb.from("settings").select("doc").eq("status", "user").limit(500);
  return (data ?? []).map((r) => r.doc as UserRec).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getUser(sb: SB, id: string): Promise<UserRec | null> {
  const { data } = await sb.from("settings").select("doc").eq("id", `user:${id}`).maybeSingle();
  return (data?.doc as UserRec | null) ?? null;
}
export async function saveUser(sb: SB, u: UserRec): Promise<void> {
  const { error } = await sb.from("settings").upsert({ id: `user:${u.id}`, doc: u, status: "user", created: u.created });
  if (error) throw new Error(error.message);
  cache.delete(u.id);
}
export async function deleteUserRow(sb: SB, id: string): Promise<void> {
  const { error } = await sb.from("settings").delete().eq("id", `user:${id}`);
  if (error) throw new Error(error.message);
  cache.delete(id);
}
/** Email or mobile → the account. */
export async function findByLogin(sb: SB, login: string): Promise<UserRec | null> {
  const l = login.trim();
  const users = await listUsers(sb);
  if (l.includes("@")) return users.find((u) => u.email === cleanEmail(l)) ?? null;
  const m = cleanMobileTen(l);
  return m.length === 10 ? users.find((u) => u.mobile === m) ?? null : null;
}
export function newUser(o: { name: string; email: string; mobile: string; dept: string; perms: string[]; pass: string; by: string }): UserRec {
  return {
    id: randomUUID().slice(0, 8), name: o.name.trim(), email: cleanEmail(o.email), mobile: cleanMobileTen(o.mobile), dept: o.dept,
    perms: [...new Set(o.perms.filter(isPerm))], status: "active", pass: o.pass, mustChange: true, ver: 1, failed: 0, lockedUntil: null,
    created: new Date().toISOString(), createdBy: o.by, lastLogin: null, passChanged: null,
  };
}

/** For proxy.ts: the user behind a session, cached for a few seconds so
 *  each page load doesn't read the database for every request. */
const cache = new Map<string, { at: number; u: UserRec | null }>();
export async function sessionUser(id: string, fresh = false): Promise<UserRec | null> {
  const hit = cache.get(id);
  if (!fresh && hit && Date.now() - hit.at < 5000) return hit.u;
  const sb = serviceClient();
  if (!sb) return null;
  const u = await getUser(sb, id);
  cache.set(id, { at: Date.now(), u });
  return u;
}

/* ---------------- audit trail ---------------- */
export interface AuditEntry { at: string; by: string; byId: string; text: string; path?: string }
export async function audit(sb: SB, who: Pick<Actor, "id" | "name">, text: string, path?: string): Promise<void> {
  const at = new Date().toISOString();
  await sb.from("settings").insert({ id: `audit:${at}:${randomBytes(3).toString("hex")}`, doc: { at, by: who.name, byId: who.id, text: text.slice(0, 300), ...(path ? { path } : {}) }, status: "audit", created: at });
}
export async function listAudit(sb: SB, limit = 200): Promise<AuditEntry[]> {
  const { data } = await sb.from("settings").select("doc").eq("status", "audit").order("created", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => r.doc as AuditEntry);
}
