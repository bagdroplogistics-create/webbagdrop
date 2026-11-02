import { NextResponse } from "next/server";
import { checkAdminKey, makeSessionToken, makeUserToken, ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { audit, checkPassword, findByLogin, LOCK_MINUTES, LOCK_TRIES, saveUser } from "@/lib/users";
import { opsNotify } from "@/lib/automation";
import { failures, recordFailure } from "@/lib/throttle";

/** BAGDROP OS sign-in.
 *   {login, password}  a team member: email or mobile + password. 5 wrong
 *                      tries lock the account for 15 minutes.
 *   {key}              the owner's emergency admin key — every use is
 *                      written to the audit trail and alerts the team. */
const cookie = (res: NextResponse, token: string) => res.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ADMIN_COOKIE_MAX_AGE });

export async function POST(req: Request) {
  let body: { key?: string; login?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const sb = serviceClient();

  if (body.key !== undefined) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    /* 10 wrong owner keys in an hour locks it for the rest of that hour; the team hears at the 5th */
    if ((await failures("ownerkey", 3_600_000)) >= 10) return NextResponse.json({ error: "LOCKED", detail: "Too many wrong owner keys — try again next hour." }, { status: 423 });
    if (!body.key || !checkAdminKey(body.key)) {
      const n = await recordFailure("ownerkey", 3_600_000);
      if (n === 5 && sb) await opsNotify(`BAGDROP OS: 5 wrong owner emergency keys in the last hour (latest from ${ip}).`, "Wrong owner keys", `ownerkeyfail:${Date.now()}`).catch(() => 0);
      return NextResponse.json({ error: "WRONG_KEY" }, { status: 401 });
    }
    if (sb) {
      await audit(sb, { id: "owner", name: "Owner (emergency key)" }, `Signed in with the owner emergency key (${ip})`).catch(() => undefined);
      await opsNotify(`BAGDROP OS: someone signed in with the owner emergency key at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (${ip}). If this wasn't you, change ADMIN_SECRET_KEY.`, "Owner emergency key used", `ownerkey:${Date.now()}`).catch(() => 0);
    }
    const res = NextResponse.json({ ok: true, owner: true });
    cookie(res, makeSessionToken());
    return res;
  }

  const wrong = () => NextResponse.json({ error: "WRONG_LOGIN", detail: "That email/mobile and password don't match." }, { status: 401 });
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  if (!body.login?.trim() || !body.password) return wrong();
  const u = await findByLogin(sb, body.login);
  if (!u) { await new Promise((r) => setTimeout(r, 300)); return wrong(); }
  if (u.status !== "active") return NextResponse.json({ error: "DISABLED", detail: "This login is turned off. Ask a manager." }, { status: 403 });
  if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) {
    const mins = Math.ceil((Date.parse(u.lockedUntil) - Date.now()) / 60000);
    return NextResponse.json({ error: "LOCKED", detail: `Too many wrong tries — try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask a manager to reset your password.` }, { status: 423 });
  }
  if (!(await checkPassword(body.password, u.pass))) {
    const failed = u.failed + 1;
    const lock = failed >= LOCK_TRIES;
    await saveUser(sb, { ...u, failed: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null });
    if (lock) await audit(sb, u, `Locked for ${LOCK_MINUTES} minutes after ${LOCK_TRIES} wrong passwords`).catch(() => undefined);
    return lock ? NextResponse.json({ error: "LOCKED", detail: `Too many wrong tries — locked for ${LOCK_MINUTES} minutes.` }, { status: 423 }) : wrong();
  }
  const now = new Date().toISOString();
  await saveUser(sb, { ...u, failed: 0, lockedUntil: null, lastLogin: now });
  await audit(sb, u, "Signed in").catch(() => undefined);
  const res = NextResponse.json({ ok: true, mustChange: u.mustChange });
  cookie(res, makeUserToken(u.id, u.ver));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
