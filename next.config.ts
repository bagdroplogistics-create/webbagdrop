import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
