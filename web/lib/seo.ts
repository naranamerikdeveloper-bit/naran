// Canonical + hreflang for a locale-prefixed path ("" = home). x-default → mn.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://naranamerikbaraa.mn").replace(/\/$/, "");

export function alternatesFor(lang: string, path = "") {
  const p = path && !path.startsWith("/") ? `/${path}` : path;
  return {
    canonical: `${SITE}/${lang}${p}`,
    languages: { mn: `${SITE}/mn${p}`, en: `${SITE}/en${p}`, "x-default": `${SITE}/mn${p}` },
  };
}
