import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyCookieValue, ADMIN_COOKIE } from "@/lib/adminAuth";

/** Gate for /admin and /api/admin/*. Next.js 16 renamed `middleware.ts` to
 *  `proxy.ts` (the `middleware` export is silently ignored now — see
 *  node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
 *  and the file must live next to `app/` — since this project uses `src/app`,
 *  that's `src/proxy.ts`, not a project-root `proxy.ts`. Proxy also now
 *  defaults to the Node.js runtime, so unlike the old Edge middleware this
 *  can verify the signed session token directly with node:crypto. */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login" || pathname === "/api/admin/login") return NextResponse.next();

  const ok = verifyCookieValue(req.cookies.get(ADMIN_COOKIE)?.value);

  if (pathname.startsWith("/api/admin")) {
    if (!ok) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return NextResponse.next();
  }

  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
