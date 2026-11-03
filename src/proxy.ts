import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, ADMIN_COOKIE } from "@/lib/adminAuth";
import { ACTOR_HEADER, apiNeed, type Actor } from "@/lib/access";
import { audit, sessionUser } from "@/lib/users";
import { serviceClient } from "@/lib/supabaseAdmin";

/** Gate for /admin and /api/admin/*. Next.js 16 renamed `middleware.ts` to
 *  `proxy.ts` (the `middleware` export is silently ignored now — see
 *  node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
 *  and the file must live next to `app/` — since this project uses `src/app`,
 *  that's `src/proxy.ts`, not a project-root `proxy.ts`. Proxy also now
 *  defaults to the Node.js runtime, so it can verify the signed session and
 *  read the user's account directly.
 *
 *  For a team member's session it also checks: the account is still active
 *  and the session wasn't ended (password reset, disable, sign out
 *  everywhere); a user who must change their password can do only that;
 *  and the request is allowed by their access checkboxes (src/lib/access.ts).
 *  It then tells the route who is asking (ACTOR_HEADER — anything the
 *  browser sent under that name is dropped) and writes every change to the
 *  audit trail. */
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const api = pathname.startsWith("/api/admin");
  if (pathname === "/admin/login" || pathname === "/api/admin/login") return NextResponse.next();

  const unauthorized = (detail?: string) => {
    if (api) return NextResponse.json({ error: "UNAUTHORIZED", ...(detail ? { detail } : {}) }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    // Drop the original query string — bagdrop.co's reverse proxy (see
    // bagdrop-web/next.config.ts rewrites()) appends a Vercel protection-
    // bypass secret to every request, which `.clone()` would otherwise
    // carry straight into this client-visible redirect URL.
    url.search = "";
    return NextResponse.redirect(url);
  };

  const s = parseSessionToken(req.cookies.get(ADMIN_COOKIE)?.value);
  if (!s) return unauthorized();

  let actor: Actor;
  if (s.kind === "owner") actor = { id: "owner", name: "Owner (emergency key)", owner: true, grants: "*" };
  else {
    let u = await sessionUser(s.id);
    if (u && u.ver !== s.ver) u = await sessionUser(s.id, true); // just changed (e.g. a new password): read it again before deciding
    if (!u || u.status !== "active" || u.ver !== s.ver) return unauthorized("Your session has ended — sign in again.");
    actor = { id: u.id, name: u.name, owner: false, grants: u.perms, ...(u.mustChange ? { mustChange: true } : {}) };
  }

  const fwd = new Headers(req.headers);
  fwd.delete(ACTOR_HEADER);
  fwd.set(ACTOR_HEADER, Buffer.from(JSON.stringify(actor)).toString("base64url"));
  if (!api) return NextResponse.next({ request: { headers: fwd } }); // the page asks /api/admin/me what to show

  if (actor.mustChange && !pathname.startsWith("/api/admin/me")) {
    return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED", detail: "Set your own password first." }, { status: 403 });
  }
  const need = apiNeed(actor.grants, pathname, req.method, search);
  if (!need.ok) {
    return NextResponse.json({ error: "FORBIDDEN", detail: `Your login doesn't have “${need.need}”. Ask a manager to tick it for you in Security & audit → Users.` }, { status: 403 });
  }
  if (req.method !== "GET" && req.method !== "HEAD" && !pathname.startsWith("/api/admin/me")) {
    const sb = serviceClient();
    const action = req.headers.get("content-type")?.includes("json") ? await req.clone().json().then((b: { action?: unknown }) => (typeof b?.action === "string" ? b.action.slice(0, 40) : "")).catch(() => "") : "";
    if (sb) await audit(sb, actor, `${req.method} ${pathname.replace(/^\/api\/admin\//, "")}${action ? ` · ${action}` : ""}`, pathname).catch(() => undefined);
  }
  return NextResponse.next({ request: { headers: fwd } });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
