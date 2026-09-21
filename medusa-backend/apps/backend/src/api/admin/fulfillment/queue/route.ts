import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

// GET /admin/fulfillment/queue — orders that still need work (fulfill or ship).
//
// Note: `fulfillment_status`/`payment_status` are COMPUTED fields that the query
// graph does not populate (they come back undefined), so we derive the next
// action from the `fulfillments` relation instead, which IS populated:
//   no active fulfillment            → "fulfill"
//   has fulfillment, any not shipped → "ship"
//   all shipped                      → done (excluded from the queue)
// We scan recent orders newest-first and cap the scan for scale.
const MAX_SCAN = 2000;
const PAGE = 200;

// Payment collection statuses that mean "safe to ship".
const PAID = new Set(["authorized", "captured", "partially_captured"]);

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const out: any[] = [];
  let scanned = 0;
  let capped = false;

  for (let skip = 0; skip < MAX_SCAN; skip += PAGE) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id", "display_id", "email", "created_at", "status",
        "payment_collections.status",
        "items.id", "items.title", "items.product_title", "items.variant_sku", "items.quantity", "items.thumbnail",
        "shipping_address.first_name", "shipping_address.last_name",
        "shipping_address.address_1", "shipping_address.address_2", "shipping_address.city", "shipping_address.phone", "shipping_address.metadata",
        "fulfillments.id", "fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.canceled_at",
      ],
      pagination: { take: PAGE, skip, order: { created_at: "DESC" } },
    });
    const batch = (data || []) as any[];
    for (const o of batch) {
      scanned++;
      if (o.status === "canceled") continue;
      const fuls = (o.fulfillments || []).filter((f: any) => !f.canceled_at);
      const hasUnshipped = fuls.some((f: any) => !f.shipped_at);
      const action = fuls.length === 0 ? "fulfill" : hasUnshipped ? "ship" : "done";
      if (action === "done") continue;

      const a = o.shipping_address || {};
      const payStatuses = (o.payment_collections || []).map((p: any) => p.status);
      const paid = payStatuses.some((s: string) => PAID.has(s));
      out.push({
        id: o.id,
        display_id: o.display_id,
        email: o.email,
        created_at: o.created_at,
        action,
        paid,
        payment_status: payStatuses[0] || "—",
        customer: [a.first_name, a.last_name].filter(Boolean).join(" ") || o.email,
        // Street, city, entrance code and the customer's delivery notes (checkout fields).
        address: [a.address_1, a.city, a.metadata?.entrance_code ? `Орц: ${a.metadata.entrance_code}` : "", a.address_2].filter(Boolean).join(", "),
        phone: a.phone || "",
        items: (o.items || []).map((i: any) => ({
          id: i.id,
          title: i.product_title || i.title || "Бараа",
          variant: i.title && i.product_title && i.title !== i.product_title ? i.title : "",
          sku: i.variant_sku || "",
          quantity: i.quantity,
          thumbnail: i.thumbnail || "",
        })),
      });
    }
    if (batch.length < PAGE) break;
    if (skip + PAGE >= MAX_SCAN) capped = true;
  }

  const toFulfill = out.filter((o) => o.action === "fulfill").length;
  const toShip = out.filter((o) => o.action === "ship").length;
  res.json({ orders: out, scanned, capped, counts: { toFulfill, toShip, total: out.length } });
}
