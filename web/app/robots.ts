import type { MetadataRoute } from "next";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://naranamerikbaraa.mn").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private / non-indexable areas (any locale prefix).
      disallow: ["/*/account", "/*/checkout", "/*/cart", "/*/auth", "/api/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
