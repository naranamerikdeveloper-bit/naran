import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { HIDDEN_NO_IMAGE } from "../../../../lib/image-visibility";

// GET /admin/catalog/hidden-no-image
// Products parked as draft because they have no picture (lib/image-visibility).
// Powers the product-list warning widget and the "Зураг оруулах" page.
// Guarded by catalog.read (middlewares).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "subtitle", "metadata"],
    filters: { status: "draft" } as any,
    pagination: { take: 5000, skip: 0, order: { title: "ASC" } },
  });
  const items = (data || [])
    .filter((p: any) => p.metadata?.hidden_reason === HIDDEN_NO_IMAGE)
    .map((p: any) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      brand: p.metadata?.brand || p.subtitle || "",
      type: p.metadata?.fragrance_type || "",
    }));
  res.json({
    count: items.length,
    sample: items.slice(0, 8).map(p => ({ id: p.id, title: p.title })),
    items,
  });
}
