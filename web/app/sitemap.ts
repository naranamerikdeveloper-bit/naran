import type { MetadataRoute } from "next";
import { medusa } from "@/lib/medusa";
import { LOCALES } from "@/lib/i18n";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://naranamerikbaraa.mn").replace(/\/$/, "");

export const revalidate = 3600; // rebuild the sitemap hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  let slugs: string[] = [];
  try {
    const { data } = await medusa.products.list({});
    slugs = data.map(p => p.slug);
  } catch { /* backend unreachable → still emit the static routes */ }

  const entries: MetadataRoute.Sitemap = [];
  // Every page exists per-locale (/mn/…, /en/…).
  for (const lang of LOCALES) {
    const p = `${BASE}/${lang}`;
    entries.push(
      { url: `${p}`, lastModified: now, changeFrequency: "daily", priority: 1 },
      { url: `${p}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
      { url: `${p}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
      { url: `${p}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
      { url: `${p}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    );
    // No /shop?category= URLs: those pages canonicalize to /shop.
    for (const slug of slugs) {
      entries.push({ url: `${p}/product/${slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
    }
  }
  return entries;
}
