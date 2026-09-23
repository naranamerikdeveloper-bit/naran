import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductsWorkflow, updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";
import { MN_TO_HANDLE } from "../scripts/seed-categories";

// Shared catalog logic used by both the CLI importer and the admin UI, so bulk
// import/export behaves identically from the terminal or the dashboard.

const BATCH = 100;

// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, "" escapes).
export function parseCsv(text: string): Record<string, string>[] {
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

const csvCell = (v: any) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export type ImportResult = { parsed: number; created: number; skipped: number; unmapped: string[]; seconds: number };

// Import products from parsed CSV rows. Idempotent: existing handles are skipped.
export async function importProductsFromRows(
  container: any,
  rows: Record<string, string>[],
  opts: { onProgress?: (done: number, total: number) => void } = {},
): Promise<ImportResult> {
  const productModule = container.resolve(Modules.PRODUCT);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);
  const link = container.resolve(ContainerRegistrationKeys.LINK);

  const [channel] = await salesChannelModule.listSalesChannels({ name: "Default Sales Channel" });
  const [profile] = await fulfillmentModule.listShippingProfiles({});
  if (!channel || !profile) throw new Error("Missing default sales channel or shipping profile");

  // Category resolver — CSV `category` may be a handle or the Mongolian name.
  const cats = await productModule.listProductCategories({}, { select: ["id", "handle", "name"] as any });
  const catIndex = new Map<string, string>();
  for (const c of cats) {
    if (c.handle) catIndex.set(c.handle.toLowerCase(), c.id);
    if (c.name) catIndex.set(c.name.trim(), c.id);
  }
  const unmapped = new Set<string>();
  const categoryIdsFor = (raw: string): string[] => {
    const v = (raw || "").trim();
    if (!v) return [];
    const id = catIndex.get(v) ?? catIndex.get(v.toLowerCase()) ?? catIndex.get(MN_TO_HANDLE[v]);
    if (!id) { unmapped.add(v); return []; }
    return [id];
  };

  const clean = rows.filter(r => r.handle && r.title);

  // Skip handles that already exist.
  const existing = new Set<string>();
  for (let o = 0; ; o += 1000) {
    const page = await productModule.listProducts({}, { take: 1000, skip: o, select: ["handle"] as any });
    page.forEach((p: any) => p.handle && existing.add(p.handle));
    if (page.length < 1000) break;
  }
  const toImport = clean.filter(r => !existing.has(r.handle));

  const t0 = Date.now();
  let created = 0;
  for (let i = 0; i < toImport.length; i += BATCH) {
    const chunk = toImport.slice(i, i + BATCH);
    const products = chunk.map(r => {
      const price = Math.max(0, Math.round(Number(r.price) || 0));
      const sizes = (r.sizes ? r.sizes.split("|").map(s => s.trim()).filter(Boolean) : []);
      const values = sizes.length ? sizes : ["Нэг хэмжээ"];
      const img = r.image || undefined;
      return {
        title: r.title,
        handle: r.handle,
        description: r.description || "",
        status: "published" as const,
        category_ids: categoryIdsFor(r.category),
        ...(img ? { thumbnail: img, images: [{ url: img }] } : {}),
        shipping_profile_id: profile.id,
        options: [{ title: "Хэмжээ", values }],
        variants: values.map(s => ({
          title: s,
          sku: `${r.handle}-${s}`.toLowerCase().replace(/\s+/g, "-"),
          manage_inventory: false,
          options: { "Хэмжээ": s },
          prices: [{ amount: price, currency_code: "mnt" }],
        })),
        sales_channels: [{ id: channel.id }],
      };
    });
    const { result } = await createProductsWorkflow(container).run({ input: { products } });
    for (const p of result as any[]) {
      try { await link.create({ [Modules.PRODUCT]: { product_id: p.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channel.id } }); } catch { /* linked */ }
    }
    created += chunk.length;
    opts.onProgress?.(created, toImport.length);
  }

  return {
    parsed: clean.length,
    created,
    skipped: clean.length - toImport.length,
    unmapped: [...unmapped],
    seconds: Math.round((Date.now() - t0) / 1000),
  };
}

// Export the whole catalog to CSV (same columns the importer accepts). Uses the
// query graph so variant prices (in the pricing module) come through.
export async function exportProductsCsv(container: any): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const header = "handle,title,price,category,sizes,image,description";
  const lines: string[] = [header];
  for (let skip = 0; ; skip += 500) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: [
        "handle", "title", "thumbnail", "description",
        "variants.title", "variants.prices.amount", "variants.prices.currency_code",
        "categories.handle",
      ],
      pagination: { skip, take: 500 },
    });
    for (const p of page as any[]) {
      const variants = p.variants || [];
      const sizes = variants.map((v: any) => v.title).filter(Boolean).join("|");
      const price = variants[0]?.prices?.find?.((pr: any) => pr.currency_code === "mnt")?.amount ?? "";
      const category = (p.categories || [])[0]?.handle || "";
      lines.push([p.handle, p.title, price, category, sizes, p.thumbnail || "", p.description || ""].map(csvCell).join(","));
    }
    if (page.length < 500) break;
  }
  return lines.join("\n");
}

export type LowStockRow = { sku: string; variant: string; product: string; handle: string; stock: number };

// Variants (inventory-managed) at or below a stock threshold, lowest first.
export async function lowStockVariants(container: any, threshold = 5): Promise<LowStockRow[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const out: LowStockRow[] = [];
  for (let skip = 0; ; skip += 500) {
    const { data } = await query.graph({
      entity: "variant",
      fields: [
        "id", "sku", "title", "manage_inventory",
        "product.title", "product.handle",
        "inventory_items.inventory.location_levels.available_quantity",
      ],
      pagination: { skip, take: 500 },
    });
    for (const v of data as any[]) {
      if (!v.manage_inventory) continue;
      const levels = (v.inventory_items || []).flatMap((ii: any) => ii.inventory?.location_levels || []);
      const stock = levels.reduce((a: number, l: any) => a + (l.available_quantity ?? 0), 0);
      if (stock <= threshold) {
        out.push({ sku: v.sku, variant: v.title, product: v.product?.title || "", handle: v.product?.handle || "", stock });
      }
    }
    if (data.length < 500) break;
  }
  return out.sort((a, b) => a.stock - b.stock);
}

// Decrement on-hand stock for a set of variants (used when recording an offline
// sale). Only touches inventory-managed variants; unmanaged ones are treated as
// unlimited and skipped. Clamps at 0. Absolute set via updateInventoryLevelsWorkflow.
// Available stock per variant id. { manage:false } = unlimited (not tracked).
// Used by the POS to show stock and to refuse overselling.
export async function stockForVariants(
  container: any,
  ids: string[],
): Promise<Map<string, { manage: boolean; available: number }>> {
  const out = new Map<string, { manage: boolean; available: number }>();
  const want = new Set(ids.map(String));
  if (!want.size) return out;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  for (let skip = 0; out.size < want.size; skip += 500) {
    const { data } = await query.graph({
      entity: "variant",
      fields: [
        "id", "manage_inventory",
        "inventory_items.inventory.location_levels.available_quantity",
      ],
      pagination: { skip, take: 500 },
    });
    for (const v of data as any[]) {
      if (!want.has(v.id) || out.has(v.id)) continue;
      if (!v.manage_inventory) { out.set(v.id, { manage: false, available: 0 }); continue; }
      const levels = (v.inventory_items || []).flatMap((ii: any) => ii?.inventory?.location_levels || []);
      const available = levels.reduce((a: number, l: any) => a + Number(l?.available_quantity ?? 0), 0);
      out.set(v.id, { manage: true, available });
    }
    if (!data.length || data.length < 500) break;
  }
  return out;
}

export async function decrementStockForVariants(
  container: any,
  items: { variant_id: string; quantity: number }[],
): Promise<{ adjusted: number; skipped: number }> {
  if (!items.length) return { adjusted: 0, skipped: 0 };
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);
  const [location] = await stockLocationModule.listStockLocations({});
  if (!location) return { adjusted: 0, skipped: items.length };

  const qtyById = new Map<string, number>();
  for (const it of items) {
    const key = String(it.variant_id);
    qtyById.set(key, (qtyById.get(key) || 0) + Math.max(1, Math.floor(Number(it.quantity) || 1)));
  }

  // Paginate variants and match by id in JS — same proven shape as
  // setStockFromRows (no reliance on an id-array filter). Stops early once every
  // requested variant is found.
  const updates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (let skip = 0; seen.size < qtyById.size; skip += 500) {
    const { data } = await query.graph({
      entity: "variant",
      fields: [
        "id", "manage_inventory",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
      ],
      pagination: { skip, take: 500 },
    });
    for (const v of data as any[]) {
      const dec = qtyById.get(v.id);
      if (!dec || seen.has(v.id)) continue;
      seen.add(v.id);
      if (!v.manage_inventory) { skipped++; continue; }
      const item = (v.inventory_items || [])[0];
      const iid = item?.inventory_item_id;
      if (!iid) { skipped++; continue; }
      const level = (item?.inventory?.location_levels || []).find((l: any) => l.location_id === location.id);
      const from = Number(level?.stocked_quantity ?? 0);
      updates.push({ inventory_item_id: iid, location_id: location.id, stocked_quantity: Math.max(0, from - dec) });
    }
    if (data.length < 500) break;
  }
  if (updates.length) {
    await updateInventoryLevelsWorkflow(container).run({ input: { updates } });
  }
  return { adjusted: updates.length, skipped };
}

export type StockMove = { sku: string; product: string; from: number; to: number };
export type StockResult = { updated: number; notManaged: number; notFound: number; moves: StockMove[] };

// Bulk-set stock from rows of { handle|sku, stock }. `sku` targets one variant;
// `handle` sets every variant of that product. Only inventory-managed variants.
export async function setStockFromRows(container: any, rows: Record<string, string>[]): Promise<StockResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);
  const [location] = await stockLocationModule.listStockLocations({});
  if (!location) throw new Error("No stock location found");

  const byHandle = new Map<string, number>();
  const bySku = new Map<string, number>();
  for (const r of rows) {
    const stock = Math.max(0, Math.round(Number(r.stock) || 0));
    if (r.sku) bySku.set(r.sku.trim(), stock);
    else if (r.handle) byHandle.set(r.handle.trim(), stock);
  }

  const updates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = [];
  const moves: StockMove[] = [];
  let notManaged = 0, notFound = 0;
  for (let skip = 0; ; skip += 500) {
    const { data } = await query.graph({
      entity: "variant",
      fields: [
        "id", "sku", "manage_inventory", "product.handle", "product.title",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
      ],
      pagination: { skip, take: 500 },
    });
    for (const v of data as any[]) {
      let stock: number | undefined;
      if (v.sku && bySku.has(v.sku)) stock = bySku.get(v.sku);
      else if (v.product?.handle && byHandle.has(v.product.handle)) stock = byHandle.get(v.product.handle);
      if (stock === undefined) continue;
      if (!v.manage_inventory) { notManaged++; continue; }
      const item = (v.inventory_items || [])[0];
      const iid = item?.inventory_item_id;
      if (!iid) { notFound++; continue; }
      // Current quantity at this location (for the movement's "from").
      const level = (item?.inventory?.location_levels || []).find((l: any) => l.location_id === location.id);
      const from = Number(level?.stocked_quantity ?? 0);
      updates.push({ inventory_item_id: iid, location_id: location.id, stocked_quantity: stock });
      if (from !== stock) moves.push({ sku: v.sku || iid, product: v.product?.title || "—", from, to: stock });
    }
    if (data.length < 500) break;
  }

  if (updates.length) {
    await updateInventoryLevelsWorkflow(container).run({ input: { updates } });
  }
  return { updated: updates.length, notManaged, notFound, moves };
}
