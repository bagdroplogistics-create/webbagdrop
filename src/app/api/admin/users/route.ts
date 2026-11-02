import { NextResponse } from "next/server";
import { currentActor, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { DEPARTMENTS, isPerm, type Perm } from "@/lib/access";
import { audit, cleanEmail, cleanMobileTen, deleteUserRow, getUser, hashPassword, listUsers, newUser, passwordProblems, saveUser, viewOf, type UserRec } from "@/lib/users";

/** Security & audit → Users (needs "Manage users"; proxy.ts checks it).
 *   GET                                        every user (never a password)
 *   POST {action:"create", name, email, mobile, dept, perms, password}
 *        {action:"update", id, name, email, mobile, dept, perms}
 *        {action:"resetPassword", id, password}   temporary; they set their own at next sign-in
 *        {action:"disable"|"enable", id} · {action:"signOutAll", id} · {action:"unlock", id}
 *        {action:"delete", id, confirm: "<their name>"}
 *  Nobody can disable or delete themselves, and the last active user who can
 *  manage users can't lose that (the owner's emergency key always works). */
const fail = (status: number, error: string, detail?: string) => NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status });

export async function GET() {
  if (!(await isAdminRequest())) return fail(401, "UNAUTHORIZED");
  const sb = serviceClient();
  if (!sb) return fail(503, "SUPABASE_NOT_CONFIGURED");
  return NextResponse.json({ users: (await listUsers(sb)).map(viewOf), departments: DEPARTMENTS }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return fail(401, "UNAUTHORIZED");
  const sb = serviceClient();
  if (!sb) return fail(503, "SUPABASE_NOT_CONFIGURED");
  const me = await currentActor();
  if (!me) return fail(401, "UNAUTHORIZED");
  let b: { action?: string; id?: string; name?: string; email?: string; mobile?: string; dept?: string; perms?: string[]; password?: string; confirm?: string };
  try { b = await req.json(); } catch { return fail(400, "BAD_JSON"); }
  const users = await listUsers(sb);
  const log = (text: string) => audit(sb, me, text).catch(() => undefined);

  /* details shared by create and update */
  const details = (exceptId?: string): { ok: true; v: Pick<UserRec, "name" | "email" | "mobile" | "dept" | "perms"> } | { ok: false; res: NextResponse } => {
    const name = (b.name ?? "").trim().slice(0, 60), email = cleanEmail(b.email ?? ""), mobile = cleanMobileTen(b.mobile ?? "");
    const dept = DEPARTMENTS.some((d) => d.key === b.dept) ? b.dept! : "custom";
    const perms = [...new Set((b.perms ?? []).filter(isPerm))] as Perm[];
    if (name.length < 2) return { ok: false, res: fail(400, "INVALID", "Enter the person's name.") };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, res: fail(400, "INVALID", "Enter a valid email — it's one way to sign in.") };
    if (mobile.length !== 10 || !/^[6-9]/.test(mobile)) return { ok: false, res: fail(400, "INVALID", "Enter a 10-digit Indian mobile — it's the other way to sign in.") };
    const others = users.filter((u) => u.id !== exceptId);
    if (others.some((u) => u.email === email)) return { ok: false, res: fail(409, "DUPLICATE", `${email} already has a login.`) };
    if (others.some((u) => u.mobile === mobile)) return { ok: false, res: fail(409, "DUPLICATE", `${mobile} already has a login.`) };
    if (perms.length === 0) return { ok: false, res: fail(400, "INVALID", "Tick at least one box — a login with no access can't see anything.") };
    return { ok: true, v: { name, email, mobile, dept, perms } };
  };
  const tempPassword = (u: Pick<UserRec, "name" | "email" | "mobile">) => {
    const p = passwordProblems(b.password ?? "", u);
    return p.length ? fail(400, "WEAK_PASSWORD", `The temporary password needs ${p.join(", ")}.`) : null;
  };
  /* someone must always be able to manage users */
  const managers = (list: UserRec[]) => list.filter((u) => u.status === "active" && u.perms.includes("act.manage_users"));
  const keepsAManager = (next: UserRec[]) => managers(users).length === 0 || managers(next).length > 0;

  if (b.action === "create") {
    const d = details();
    if (!d.ok) return d.res;
    const bad = tempPassword(d.v);
    if (bad) return bad;
    const u = { ...newUser({ ...d.v, pass: await hashPassword(b.password!), by: me.name }), perms: d.v.perms };
    await saveUser(sb, u);
    await log(`Created login for ${u.name} (${DEPARTMENTS.find((x) => x.key === u.dept)?.name ?? u.dept}, ${u.perms.length} permissions)`);
    return NextResponse.json({ ok: true, user: viewOf(u) });
  }

  const u = b.id ? await getUser(sb, b.id) : null;
  if (!u) return fail(404, "NOT_FOUND", "That user doesn't exist any more.");
  const self = u.id === me.id;
  const replace = (x: UserRec) => users.map((y) => (y.id === x.id ? x : y));

  switch (b.action) {
    case "update": {
      const d = details(u.id);
      if (!d.ok) return d.res;
      const next = { ...u, ...d.v };
      if (self && !next.perms.includes("act.manage_users") && u.perms.includes("act.manage_users")) return fail(400, "SELF", "You can't take away your own Manage users — ask another manager.");
      if (!keepsAManager(replace(next))) return fail(400, "LAST_MANAGER", "Someone has to be able to manage users — tick Manage users for another person first.");
      const added = next.perms.filter((p) => !u.perms.includes(p)), removed = u.perms.filter((p) => !next.perms.includes(p));
      await saveUser(sb, next);
      await log(`Updated ${next.name}${added.length ? ` · added ${added.join(", ")}` : ""}${removed.length ? ` · removed ${removed.join(", ")}` : ""}${u.name !== next.name || u.email !== next.email || u.mobile !== next.mobile ? " · details changed" : ""}`);
      return NextResponse.json({ ok: true, user: viewOf(next) });
    }
    case "resetPassword": {
      const bad = tempPassword(u);
      if (bad) return bad;
      const next = { ...u, pass: await hashPassword(b.password!), mustChange: true, ver: u.ver + 1, failed: 0, lockedUntil: null };
      await saveUser(sb, next);
      await log(`Reset the password of ${u.name} (signed out everywhere; they set their own at next sign-in)`);
      return NextResponse.json({ ok: true, user: viewOf(next) });
    }
    case "disable": case "enable": {
      if (self) return fail(400, "SELF", "You can't turn off your own login.");
      const next = { ...u, status: b.action === "disable" ? "disabled" as const : "active" as const, ver: u.ver + (b.action === "disable" ? 1 : 0) };
      if (!keepsAManager(replace(next))) return fail(400, "LAST_MANAGER", "This is the last person who can manage users — give someone else Manage users first.");
      await saveUser(sb, next);
      await log(`${b.action === "disable" ? "Turned off" : "Turned on"} the login of ${u.name}`);
      return NextResponse.json({ ok: true, user: viewOf(next) });
    }
    case "signOutAll": {
      const next = { ...u, ver: u.ver + 1 };
      await saveUser(sb, next);
      await log(`Signed ${u.name} out of every device`);
      return NextResponse.json({ ok: true, user: viewOf(next) });
    }
    case "unlock": {
      const next = { ...u, failed: 0, lockedUntil: null };
      await saveUser(sb, next);
      await log(`Unlocked ${u.name}`);
      return NextResponse.json({ ok: true, user: viewOf(next) });
    }
    case "delete": {
      if (self) return fail(400, "SELF", "You can't delete your own login.");
      if ((b.confirm ?? "").trim().toLowerCase() !== u.name.toLowerCase()) return fail(400, "CONFIRM", `Type ${u.name} to confirm.`);
      if (!keepsAManager(users.filter((x) => x.id !== u.id))) return fail(400, "LAST_MANAGER", "This is the last person who can manage users — give someone else Manage users first.");
      await deleteUserRow(sb, u.id);
      await log(`Deleted the login of ${u.name} (${u.email}, ${u.mobile}) — their past actions stay in this audit trail`);
      return NextResponse.json({ ok: true });
    }
  }
  return fail(400, "BAD_ACTION");
}
