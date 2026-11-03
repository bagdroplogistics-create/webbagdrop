/** Multi-zone support — this exact app can also be reverse-proxied onto
 *  bagdrop.co under a path prefix (e.g. /admin-1, /new-website), alongside
 *  its own unprefixed domains (bagdrop-new.vercel.app, webbagdrop.vercel.app).
 *  NEXT_PUBLIC_BASE_PATH is unset for those existing deployments, so
 *  BASE_PATH is "" there and every helper here is a pure no-op — current
 *  behavior is untouched unless this env var is explicitly set on a new,
 *  separate build.
 *
 *  Next.js's own basePath config (see next.config.ts) already rewrites
 *  next/link, next/image and server-side redirect()/NextResponse.redirect
 *  built from req.nextUrl automatically. It does NOT rewrite raw
 *  fetch("/api/...") calls, raw <img src="/..."> tags, raw <a href="/...">
 *  tags, or a fresh `new URL("/path", origin)` — those are covered here. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an absolute same-origin path (starting with "/") for use in a raw
 *  fetch(), <img src>, <a href> or NextResponse.redirect — anywhere Next.js
 *  doesn't already handle basePath for us. Leaves relative paths, hashes and
 *  absolute https:// URLs untouched. */
export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//")) return path;
  return `${BASE_PATH}${path}`;
}

/** Patches window.fetch at module-evaluation time (not inside a React
 *  effect — this module is imported directly by the root layout, so it
 *  runs before any component's effects can fire a fetch() of its own).
 *  No-op when BASE_PATH is "". Idempotent against React Strict Mode /
 *  Fast Refresh re-evaluating this module. */
if (typeof window !== "undefined" && BASE_PATH && !("__bdBasePathPatched" in window)) {
  (window as unknown as { __bdBasePathPatched: boolean }).__bdBasePathPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/") && !input.startsWith("//") && !input.startsWith(BASE_PATH)) {
      input = BASE_PATH + input;
    }
    return original(input, init);
  };
}
