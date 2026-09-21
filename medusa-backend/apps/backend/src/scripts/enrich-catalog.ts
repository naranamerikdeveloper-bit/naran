import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Derive the storefront facets for every product and store them on it, so
 * browse can filter/sort without guessing. Idempotent — run after any import.
 *
 *   npx medusa exec ./src/scripts/enrich-catalog.ts
 *
 * Sets:
 *   metadata.fragrance_type  EDP | EDT | Parfum | Extrait | Cologne | Mist | Set
 *                            (from the handle suffix the importer produces)
 *   metadata.brand           kept; falls back to the subtitle
 *   metadata.badge           "New" when a size is marked "Шинэ" in the price list
 *   category                 gift (sets / collections) · body (body mists) · fragrance
 */
const SUFFIX: Record<string, string> = {
  edp: "EDP", edt: "EDT", parfum: "Parfum", extrait: "Extrait", cologne: "Cologne", mist: "Mist", set: "Set",
};

export default async function enrichCatalog({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);

  const cats = await productModule.listProductCategories({ handle: ["fragrance", "body", "gift"] }, { select: ["id", "handle"] as any });
  const catId = Object.fromEntries(cats.map(c => [c.handle, c.id]));
  if (!catId.fragrance || !catId.body || !catId.gift) throw new Error("Run seed-categories first (fragrance/body/gift missing)");

  const tally: Record<string, number> = {};
  let changed = 0, seen = 0;
  for (let skip = 0; ; skip += 200) {
    const page = await productModule.listProducts(
      {},
      { take: 200, skip, select: ["id", "handle", "title", "subtitle", "description", "metadata"] as any, relations: ["variants", "categories"] as any },
    );
    for (const p of page as any[]) {
      seen++;
      const type = SUFFIX[(p.handle || "").split("-").pop()] ?? "";
      const isSet = type === "Set" || /\b(set|collection)\b/i.test(p.title || "");
      const cat = isSet ? "gift" : type === "Mist" ? "body" : "fragrance";
      const isNew = (p.variants || []).some((v: any) => /Шинэ/i.test(v.title || "")) || /Шинэ \(New\)/i.test(p.description || "");
      const brand = (p.metadata?.brand as string) || p.subtitle || "";

      const meta = { ...(p.metadata || {}), fragrance_type: type || undefined, brand: brand || undefined, badge: isNew ? "New" : undefined };
      for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];

      const sameMeta = JSON.stringify(meta) === JSON.stringify(p.metadata || {});
      const curCats = (p.categories || []).map((c: any) => c.id);
      const sameCat = curCats.length === 1 && curCats[0] === catId[cat];
      tally[`${cat}/${type || "?"}`] = (tally[`${cat}/${type || "?"}`] || 0) + 1;
      if (sameMeta && sameCat) continue;
      await productModule.updateProducts(p.id, { metadata: meta, category_ids: [catId[cat]] } as any);
      changed++;
    }
    if (page.length < 200) break;
  }
  logger.info(`Enriched ${changed}/${seen} products. ${Object.entries(tally).map(([k, v]) => `${k}:${v}`).join(" ")}`);
}
