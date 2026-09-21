/** @type {import('next').NextConfig} */

// Allow next/image to optimize images served from the CDN/R2 host (if set) plus
// Unsplash (the demo/seed catalog's image host — real catalogs use R2).
const remotePatterns = [{ protocol: "https", hostname: "images.unsplash.com" }];
try {
  const cdn = process.env.NEXT_PUBLIC_SITE_URL && process.env.S3_FILE_URL;
  if (process.env.S3_FILE_URL) {
    const u = new URL(process.env.S3_FILE_URL);
    remotePatterns.push({ protocol: u.protocol.replace(":", ""), hostname: u.hostname });
  }
  // Medusa's own file host — admin-uploaded images (e.g. hero/promo pictures) are
  // served from Medusa's /static in dev, and from R2 above in prod. Allow it so
  // next/image can render them.
  if (process.env.NEXT_PUBLIC_MEDUSA_URL) {
    const m = new URL(process.env.NEXT_PUBLIC_MEDUSA_URL);
    remotePatterns.push({ protocol: m.protocol.replace(":", ""), hostname: m.hostname, port: m.port || undefined });
  }
  void cdn;
} catch { /* ignore malformed URLs */ }

const nextConfig = {
  reactStrictMode: true,
  // Standalone output → small production image (only the needed node_modules).
  output: "standalone",
  // Drop console.* (except errors/warnings) from the production client bundle —
  // smaller JS and no dev logging cost in the browser.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    // Serve modern formats + responsive sizes; product images are local (public/)
    // in dev and move to R2/CDN in prod (remotePatterns above).
    // WebP only: AVIF encodes several times slower, and on this small container
    // the first visitor to a new image would wait for it.
    formats: ["image/webp"],
    // Uploaded files get unique names, so optimized variants can be kept long.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    // No 3840px variants — the widest layout is ~1280 CSS px (2560 on retina).
    deviceSizes: [640, 750, 828, 1080, 1280, 1600, 2048, 2560],
    remotePatterns,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
  async headers() {
    // Origin the browser calls Medusa on (needed in connect-src so store API
    // fetches aren't blocked once CSP is enforced).
    let medusaOrigin = "";
    try { if (process.env.NEXT_PUBLIC_MEDUSA_URL) medusaOrigin = new URL(process.env.NEXT_PUBLIC_MEDUSA_URL).origin; } catch { /* ignore */ }

    // Content Security Policy — the strongest mitigation against XSS/data
    // exfiltration. 'unsafe-inline' stays for scripts/styles because Next.js
    // hydration and framer-motion inject inline; everything else is allowlisted.
    // ENFORCED (validated against a production build). 'unsafe-eval' is added in
    // development only (webpack/HMR needs it); production bundles don't eval.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV !== "production" ? "'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net`.replace(/\s+/g, " ").trim(),
      `connect-src 'self' ${medusaOrigin} https://www.google-analytics.com https://region1.google-analytics.com https://*.ingest.sentry.io https://connect.facebook.net`.replace(/\s+/g, " ").trim(),
      "frame-src 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    const securityHeaders = [
      // Force HTTPS for 2 years incl. subdomains (only sent over https).
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      // Anti-clickjacking — the storefront is never meant to be framed.
      { key: "X-Frame-Options", value: "DENY" },
      // Stop MIME sniffing (drive-by content-type attacks).
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Don't leak full URLs (with query) to other origins.
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Turn off powerful features the store doesn't use.
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
      // Enforced CSP (see note above).
      { key: "Content-Security-Policy", value: csp },
    ];

    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wrap with Sentry only when a DSN is configured, so builds without Sentry are
// completely unaffected (no source-map step, no runtime overhead).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Source maps upload only when an auth token is present (CI/prod).
    authToken: process.env.SENTRY_AUTH_TOKEN,
  });
} else {
  module.exports = nextConfig;
}
