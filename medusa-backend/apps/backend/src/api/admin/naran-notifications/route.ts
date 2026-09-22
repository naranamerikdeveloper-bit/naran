import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { lowStockVariants } from "../../../lib/catalog";

// GET /admin/naran-notifications (not /admin/notifications: that path belongs to
// Medusa's built-in notification bell/feed, which this used to shadow) — operational alerts for the admin dashboard (spec
// A-29): low stock, pending returns, new orders today. Complements the email
// subscribers (order.placed / shipment.created). Guarded by orders.read.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const threshold = Math.max(0, Number((req.query as any)?.threshold ?? 5) || 5);

  // Low stock
  let lowStock: any[] = [];
  try { lowStock = await lowStockVariants(req.scope, threshold); } catch { /* inventory may be off */ }

  // Pending returns
  let pendingReturns = 0;
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "return",
      fields: ["id", "status"],
      filters: { status: "requested" } as any,
      pagination: { take: 1000 },
    });
    pendingReturns = (data || []).length;
  } catch { /* returns optional */ }

  // New orders today
  let newOrdersToday = 0;
  try {
    const orderModule = req.scope.resolve(Modules.ORDER);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [, count] = await orderModule.listAndCountOrders(
      { created_at: { $gte: start } } as any,
      { take: 1, select: ["id"] as any },
    );
    newOrdersToday = count;
  } catch { /* ignore */ }

  const items = [
    { key: "lowStock", label: "Бага нөөцтэй бараа", count: lowStock.length, tone: lowStock.length ? "warning" : "ok", href: "/app/catalog" },
    { key: "pendingReturns", label: "Хүлээгдэж буй буцаалт", count: pendingReturns, tone: pendingReturns ? "warning" : "ok", href: "/app/returns" },
    { key: "newOrdersToday", label: "Өнөөдрийн шинэ захиалга", count: newOrdersToday, tone: "info", href: "/app/fulfillment" },
  ];

  res.json({
    items,
    lowStockSample: lowStock.slice(0, 10),
    total: lowStock.length + pendingReturns,
  });
}
