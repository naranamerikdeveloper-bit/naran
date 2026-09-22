import { assertDestructiveAllowed } from "../lib/destructive-guard";
import { ExecArgs } from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { MN_TO_HANDLE } from "./seed-categories";
import * as fs from "fs";

/**
 * Bulk product importer — built to ingest a large catalog (10,000+ products).
 *
 *   IMPORT_FILE=./data/catalog.csv  npx medusa exec ./src/scripts/import-products.ts
 *   PURGE_PREFIX=bulk-              npx medusa exec ./src/scripts/import-products.ts   # delete imported test data
 *
 * CSV columns (header row required):
 *   handle,title,price,category,sizes,image,description[,brand]
 *   - price: integer MNT (₮)
 *   - sizes: pipe-separated (e.g. "50ml|100ml"); blank → "Нэг хэмжээ"
 *   - image: URL or /products/x.avif; blank allowed
 *   - brand: optional; stored as the product subtitle + metadata.brand
 *
 * Per-size prices: give several rows the SAME handle — they become ONE product
 * whose variants are the rows, each with its own price (a perfume's 50ml and
 * 150ml cost different amounts). In that case `sizes` is the single variant
 * label of the row. Title/category/image/description come from the first row.
 */

const BATCH = 100; // products created per workflow call

// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, "" escapes).
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export default async function importProducts({ container }: ExecArgs) {
  if (process.env.PURGE_PREFIX) assertDestructiveAllowed("import-products (PURGE_PREFIX)");
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);
  const link = container.resolve(ContainerRegistrationKeys.LINK);

  // ---- Purge mode: remove previously imported rows by handle prefix ----
  const purge = process.env.PURGE_PREFIX;
  if (purge) {
    let removed = 0;
    // Delete matches from the front repeatedly until a full pass finds none
    // (deleting shifts pagination, so never advance a skip offset here).
    for (;;) {
      const page = await productModule.listProducts({}, { take: 1000, skip: 0, select: ["id", "handle"] as any });
      const match = page.filter(p => p.handle?.startsWith(purge));
      if (!match.length) break;
      await productModule.deleteProducts(match.map(p => p.id));
      removed += match.length;
    }
    logger.info(`Purged ${removed} products with handle prefix "${purge}".`);
    return;
  }

  // ---- Import mode ----
  const file = process.env.IMPORT_FILE;
  if (!file) throw new Error("Set IMPORT_FILE=<path to .csv> (or PURGE_PREFIX=<prefix> to delete).");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

  const [channel] = await salesChannelModule.listSalesChannels({ name: "Default Sales Channel" });
  const [profile] = await fulfillmentModule.listShippingProfiles({});
  if (!channel || !profile) throw new Error("Missing default sales channel or shipping profile");

  // Category resolver — CSV `category` may hold a handle (fragrance) or the
  // Mongolian display name (Үнэртэй ус); both map to the same category id.
  const cats = await productModule.listProductCategories({}, { select: ["id", "handle", "name"] as any });
  const catIndex = new Map<string, string>();
  for (const c of cats) {
    if (c.handle) catIndex.set(c.handle.toLowerCase(), c.id);
    if (c.name) catIndex.set(c.name.trim(), c.id);
  }
  const unknownCats = new Set<string>();
  const categoryIdsFor = (raw: string): string[] => {
    const v = (raw || "").trim();
    if (!v) return [];
    const id = catIndex.get(v) ?? catIndex.get(v.toLowerCase()) ?? catIndex.get(MN_TO_HANDLE[v]);
    if (!id) { unknownCats.add(v); return []; }
    return [id];
  };

  // Strip a UTF-8 BOM: Excel's "CSV UTF-8" export adds one, which would turn the
  // first header into "﻿handle" and make EVERY row fail the filter below.
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const parsed = parseCsv(text);
  const rows = parsed.filter(r => r.handle && r.title);
  logger.info(`Parsed ${rows.length} rows from ${file}.`);
  if (parsed.length && !rows.length) {
    throw new Error(`No usable rows: expected a header row with "handle" and "title" columns, got: ${Object.keys(parsed[0]).join(", ")}`);
  }

  // Skip handles that already exist (idempotent re-runs).
  const existing = new Set<string>();
  for (let o = 0; ; o += 1000) {
    const page = await productModule.listProducts({}, { take: 1000, skip: o, select: ["handle"] as any });
    page.forEach(p => p.handle && existing.add(p.handle));
    if (page.length < 1000) break;
  }
  // Rows sharing a handle are one product (one variant per row, own price).
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const g = groups.get(r.handle);
    if (g) g.push(r); else groups.set(r.handle, [r]);
  }
  const toImport = [...groups.values()].filter(g => !existing.has(g[0].handle));
  logger.info(`${toImport.length} new products to import (${groups.size - toImport.length} already present).`);

  const toPrice = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const variantsFor = (g: Record<string, string>[]): { title: string; price: number }[] => {
    if (g.length === 1) {
      // Legacy single-row form: every size in `sizes` shares the row price.
      const sizes = (g[0].sizes ? g[0].sizes.split("|").map(s => s.trim()).filter(Boolean) : []);
      return (sizes.length ? sizes : ["Нэг хэмжээ"]).map(title => ({ title, price: toPrice(g[0].price) }));
    }
    const seen = new Map<string, number>();
    return g.map(r => {
      const base = (r.sizes || "").trim() || "Нэг хэмжээ";
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { title: n > 1 ? `${base} (${n})` : base, price: toPrice(r.price) };
    });
  };

  const t0 = Date.now();
  let created = 0;
  for (let i = 0; i < toImport.length; i += BATCH) {
    const chunk = toImport.slice(i, i + BATCH);
    const products = chunk.map(g => {
      const r = g[0];
      const variants = variantsFor(g);
      const img = r.image || undefined;
      const brand = (r.brand || "").trim();
      return {
        title: r.title,
        handle: r.handle,
        ...(brand ? { subtitle: brand, metadata: { brand } } : {}),
        description: r.description || "",
        status: "published" as const,
        category_ids: categoryIdsFor(r.category),
        ...(img ? { thumbnail: img, images: [{ url: img }] } : {}),
        shipping_profile_id: profile.id,
        options: [{ title: "Хэмжээ", values: variants.map(v => v.title) }],
        variants: variants.map(v => ({
          title: v.title,
          sku: `${r.handle}-${v.title}`.toLowerCase().replace(/[^a-z0-9а-яөүё.]+/gi, "-").replace(/^-|-$/g, ""),
          manage_inventory: false,
          options: { "Хэмжээ": v.title },
          prices: [{ amount: v.price, currency_code: "mnt" }],
        })),
        sales_channels: [{ id: channel.id }],
      };
    });

    const { result } = await createProductsWorkflow(container).run({ input: { products } });
    // Ensure sales-channel link (workflow usually does this, belt-and-braces).
    for (const p of result as any[]) {
      try { await link.create({ [Modules.PRODUCT]: { product_id: p.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channel.id } }); } catch { /* linked */ }
    }
    created += chunk.length;
    if (created % 500 === 0 || created === toImport.length) {
      const rate = Math.round(created / ((Date.now() - t0) / 1000));
      logger.info(`Imported ${created}/${toImport.length} (${rate}/s)…`);
    }
  }

  if (unknownCats.size) {
    logger.warn(`Unmapped categories (products imported uncategorised): ${[...unknownCats].join(", ")}`);
  }
  logger.info(`Done. Imported ${created} products in ${Math.round((Date.now() - t0) / 1000)}s.`);
}
