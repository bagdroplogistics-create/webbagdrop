import type { NextConfig } from "next";

/** Multi-zone support — unset on every deployment today (bagdrop-new.vercel.app,
 *  webbagdrop.vercel.app), so basePath is undefined and this is a complete
 *  no-op for current production. Set only on the two new, separate builds
 *  that get reverse-proxied onto bagdrop.co (/admin-1, /new-website) — see
 *  src/lib/basePath.ts for the parts of the app Next.js doesn't already
 *  basePath-prefix automatically (raw fetch/img/a tags). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  /* config options here */
  basePath: BASE_PATH,
  /* Next.js's built-in image optimizer breaks with basePath set — either an
   * internal self-fetch 404 (optimizer on) or a missing basePath prefix on
   * the raw <img src> (images.unoptimized). A custom loader (src/lib/
   * imageLoader.ts) sidesteps both by constructing the correctly-prefixed
   * URL itself. Only applies to the two prefixed builds; the default,
   * unprefixed deployments keep full built-in optimization, untouched. */
  ...(BASE_PATH ? { images: { loader: "custom", loaderFile: "./src/lib/imageLoader.ts" } } : {}),
  cacheComponents: true,
  poweredByHeader: false,
  /* security headers on every page and API: no framing by other sites
   * (clickjacking), no MIME sniffing, HTTPS-only once seen, and only the
   * browser features the app uses (camera + location for the driver app's
   * tag scans and GPS; Razorpay checkout needs payment). */
  headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(self \"https://api.razorpay.com\" \"https://checkout.razorpay.com\")" },
      ],
    }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
