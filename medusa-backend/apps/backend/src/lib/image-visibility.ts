import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

// A product with no picture must not be shown to shoppers (it renders as a
// blank placeholder). Instead of deleting or hand-managing such products, we
// park them as DRAFT with metadata.hidden_reason = "no_image":
//   - the store API, product pages and search only ever see published products,
//   - the admin still lists them (Draft) with a warning widget,
//   - adding an image auto-publishes them again.
// Only drafts WE created (hidden_reason === "no_image") are ever re-published,
// so a product an admin deliberately set to draft is never touched.
export const HIDDEN_NO_IMAGE = "no_image";

type P = { id: string; status: string; thumbnail?: string | null; images?: { url?: string }[] | null; metadata?: Record<string, unknown> | null };

export const hasImage = (p: P) => !!(p.thumbnail || (p.images || []).some(i => i?.url));

/** What (if anything) to change so visibility matches the image rule. */
export function visibilityPatch(p: P): { status: "draft" | "published"; metadata: Record<string, unknown> } | null {
  const meta = { ...(p.metadata || {}) };
  const hiddenByUs = meta.hidden_reason === HIDDEN_NO_IMAGE;
  if (!hasImage(p) && p.status === "published") {
    return { status: "draft", metadata: { ...meta, hidden_reason: HIDDEN_NO_IMAGE } };
  }
  if (hasImage(p) && hiddenByUs) {
    // Medusa MERGES metadata on update, so omitting the key would keep it;
    // an empty string is how a metadata key is deleted.
    return { status: p.status === "draft" ? "published" : (p.status as any), metadata: { ...meta, hidden_reason: "" } };
  }
  return null;
}

/** Apply the rule to the given products (or all). Returns counts. */
export async function syncImageVisibility(container: MedusaContainer, ids?: string[]) {
  const productModule = container.resolve(Modules.PRODUCT);
  let hidden = 0, published = 0, seen = 0;
  for (let skip = 0; ; skip += 200) {
    const page = await productModule.listProducts(
      ids ? { id: ids } : {},
      { take: 200, skip, select: ["id", "status", "thumbnail", "metadata"] as any, relations: ["images"] as any },
    );
    for (const p of page as any[]) {
      seen++;
      const patch = visibilityPatch(p);
      if (!patch) continue;
      // If this re-emits product.updated, the subscriber just finds nothing to
      // change (visibilityPatch is idempotent), so there is no loop.
      await productModule.updateProducts(p.id, patch as any);
      patch.status === "draft" ? hidden++ : published++;
    }
    if (ids || page.length < 200) break;
  }
  return { seen, hidden, published };
}
