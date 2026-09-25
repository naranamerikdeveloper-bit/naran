import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import {
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
  batchLinkProductsToCategoryWorkflow,
} from "@medusajs/medusa/core-flows";
import { audit } from "../../../../lib/audit";

// POST /admin/catalog/bulk-edit
//   { product_ids: string[], set: { status?, price?, category_add?, category_remove? } }
// Apply price / status / category changes to many products at once (spec A-11).
// Each operation is independent and reported separately so a partial failure
// doesn't hide the successful ones.
const CURRENCY = "mnt";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  const ids: string[] = Array.isArray(body.product_ids) ? body.product_ids : [];
  const set = body.set || {};
  if (!ids.length) {
    res.status(400).json({ message: "product_ids шаардлагатай" });
    return;
  }

  const applied: Record<string, any> = {};
  const errors: Record<string, string> = {};

  // Status (published | draft)
  if (set.status === "published" || set.status === "draft") {
    try {
      await updateProductsWorkflow(req.scope).run({
        input: { selector: { id: ids }, update: { status: set.status } },
      });
      applied.status = set.status;
    } catch (e: any) {
      errors.status = e?.message || "status update failed";
    }
  }

  // Price (set MNT price on every variant of the selected products)
  if (set.price !== undefined && set.price !== null && set.price !== "") {
    const amount = Math.round(Number(set.price));
    if (!Number.isFinite(amount) || amount < 0) {
      errors.price = "Буруу үнэ";
    } else {
      try {
        await updateProductVariantsWorkflow(req.scope).run({
          input: {
            selector: { product_id: ids },
            update: { prices: [{ amount, currency_code: CURRENCY }] } as any,
          },
        });
        applied.price = amount;
      } catch (e: any) {
        errors.price = e?.message || "price update failed";
      }
    }
  }

  // Category add
  if (set.category_add) {
    try {
      await batchLinkProductsToCategoryWorkflow(req.scope).run({
        input: { id: set.category_add, add: ids } as any,
      });
      applied.category_add = set.category_add;
    } catch (e: any) {
      errors.category_add = e?.message || "category add failed";
    }
  }

  // Category remove
  if (set.category_remove) {
    try {
      await batchLinkProductsToCategoryWorkflow(req.scope).run({
        input: { id: set.category_remove, remove: ids } as any,
      });
      applied.category_remove = set.category_remove;
    } catch (e: any) {
      errors.category_remove = e?.message || "category remove failed";
    }
  }

  // Gender (metadata.gender = Men | Women | Unisex, or "none" to clear). Drives
  // the storefront's Эр/Эм shop filter + nav. Medusa REPLACES a product's
  // metadata on update, so we read each product's current metadata and merge the
  // one key (keeping badge / fragrance_type etc.).
  const GENDERS = new Set(["Men", "Women", "Unisex", "none"]);
  if (set.gender && GENDERS.has(String(set.gender))) {
    const g = String(set.gender);
    try {
      const productModule = req.scope.resolve(Modules.PRODUCT);
      const current: any[] = await productModule.listProducts({ id: ids }, { select: ["id", "metadata"] as any });
      const products = current.map((p) => {
        const meta = { ...((p.metadata as any) || {}) };
        if (g === "none") delete meta.gender; else meta.gender = g;
        return { id: p.id, metadata: meta };
      });
      await updateProductsWorkflow(req.scope).run({ input: { products } as any });
      applied.gender = g;
    } catch (e: any) {
      errors.gender = e?.message || "gender update failed";
    }
  }

  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "catalog.bulk_edit",
    target: `${ids.length} products`,
    meta: { applied },
  }, Date.now());

  res.json({ count: ids.length, applied, errors: Object.keys(errors).length ? errors : undefined });
}
