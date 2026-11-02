import { NextResponse } from "next/server";
import { currentActor, makeUserToken, ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { audit, checkPassword, getUser, hashPassword, passwordProblems, saveUser, viewOf } from "@/lib/users";

/** The signed-in person: GET → name, access and whether they must set a new
 *  password. POST {action:"password", current, next} changes their own
 *  password (ends their other sessions; this one carries on). */
export async function GET() {
  const a = await currentActor();
  if (!a) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (a.owner) return NextResponse.json({ ...a, user: null }, { headers: { "Cache-Control": "no-store" } });
  const sb = serviceClient();
  const u = sb ? await getUser(sb, a.id) : null;
  return NextResponse.json({ ...a, user: u ? viewOf(u) : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const a = await currentActor();
  if (!a) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (a.owner) return NextResponse.json({ error: "OWNER_KEY", detail: "The owner key is set in the server settings (ADMIN_SECRET_KEY), not here." }, { status: 400 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: { action?: string; current?: string; next?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (b.action !== "password") return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
  const u = await getUser(sb, a.id);
  if (!u) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!b.current || !(await checkPassword(b.current, u.pass))) return NextResponse.json({ error: "WRONG_PASSWORD", detail: "Your current password isn't right." }, { status: 400 });
  const next = b.next ?? "";
  const problems = passwordProblems(next, u);
  if (problems.length) return NextResponse.json({ error: "WEAK_PASSWORD", detail: `The new password needs ${problems.join(", ")}.` }, { status: 400 });
  if (await checkPassword(next, u.pass)) return NextResponse.json({ error: "SAME_PASSWORD", detail: "Pick a password different from the current one." }, { status: 400 });
  const ver = u.ver + 1;
  await saveUser(sb, { ...u, pass: await hashPassword(next), mustChange: false, ver, passChanged: new Date().toISOString() });
  await audit(sb, u, "Changed their password").catch(() => undefined);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, makeUserToken(u.id, ver), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ADMIN_COOKIE_MAX_AGE });
  return res;
}
