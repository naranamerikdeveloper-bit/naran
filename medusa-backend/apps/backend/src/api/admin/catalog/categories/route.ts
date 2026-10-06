import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { slugify } from "../../../../lib/nav";
import { audit } from "../../../../lib/audit";

// POST /admin/catalog/categories — create a product category from a plain name.
//
// Exists so the owner can add a navbar item and get a real, product-assignable
// category in one step: the handle is transliterated from Mongolian here rather
// than left to the owner, and an existing category with the same handle is
// reused instead of erroring out. Guarded by catalog.write.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!name) return res.status(400).json({ message: "Ангиллын нэр хоосон байна" });
  const handle = slugify(String(body.handle ?? "").trim() || name);

  const service = req.scope.resolve(Modules.PRODUCT);
  const existing = await service.listProductCategories({ handle }, { take: 1 });
  if (existing?.[0]) {
    return res.json({ product_category: existing[0], created: false });
  }
  const [created] = await service.createProductCategories([
    { name, handle, is_active: true, is_internal: false },
  ] as any);
  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "catalog.category.create",
    target: created?.id || handle,
    meta: { name, handle },
  }, Date.now());
  res.json({ product_category: created, created: true });
}
