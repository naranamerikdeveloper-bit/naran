import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createOrderWorkflow,
  createOrderPaymentCollectionWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows";
import { decrementStockForVariants, stockForVariants } from "../../../lib/catalog";
import { reserveOrderItems, fulfillOrder, shipOrder, deliverOrder } from "../../../lib/fulfillment";

const CURRENCY = "mnt";

// GET /admin/offline-sale?q=  — product + variant picker (id, title, sku, MNT
// price) for the in-person sale form. Published products only.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  // ?summary=1 → today's in-store sales (count + total), for the POS header.
  if (req.query.summary) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "total", "created_at", "metadata"],
      filters: { created_at: { $gte: start.toISOString() } } as any,
      pagination: { take: 500, skip: 0, order: { created_at: "DESC" } },
    });
    const today = (data || []).filter((o: any) => o?.metadata?.offline);
    res.json({ summary: { count: today.length, total: today.reduce((a: number, o: any) => a + Number(o.total || 0), 0) } });
    return;
  }

  const q = (req.query.q as string) || "";
  const filters: any = { status: "published" };
  if (q) filters.title = { $ilike: `%${q}%` };

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "thumbnail",
      "variants.id", "variants.title", "variants.sku", "variants.manage_inventory",
      "variants.prices.amount", "variants.prices.currency_code",
      "variants.inventory_items.inventory.location_levels.available_quantity",
    ],
    filters,
    pagination: { take: 50, skip: 0, order: { title: "ASC" } },
  });

  const products = (data || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail || "",
    variants: (p.variants || []).map((v: any) => {
      const mnt = (v.prices || []).find((pr: any) => pr.currency_code === CURRENCY);
      const levels = (v.inventory_items || []).flatMap((ii: any) => ii?.inventory?.location_levels || []);
      const available = levels.reduce((a: number, l: any) => a + Number(l?.available_quantity ?? 0), 0);
      return { id: v.id, title: v.title || p.title, sku: v.sku || "", price: mnt ? Number(mnt.amount) : 0, manage: v.manage_inventory !== false, stock: v.manage_inventory === false ? null : available };
    }),
  }));

  res.json({ products });
}

// POST /admin/offline-sale — record an in-person / offline sale as a Medusa
// order so it shows up alongside online sales in Orders, Analytics and Reports.
// Body: { items:[{variant_id, quantity, title, unit_price}], email?, customerName?,
//         phone?, paymentMethod?, note? }
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as any;
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems
    .map((i: any) => ({
      variant_id: String(i.variant_id || ""),
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      title: String(i.title || "Бараа").slice(0, 200),
      unit_price: Math.max(0, Math.round(Number(i.unit_price) || 0)),
    }))
    .filter((i: any) => i.variant_id);

  if (!items.length) {
    res.status(400).json({ message: "Дор хаяж нэг бараа сонгоно уу." });
    return;
  }

  // Refuse to oversell: managed variants can't go below zero.
  const stock = await stockForVariants(req.scope, items.map((i: any) => i.variant_id));
  const short = items
    .map((i: any) => ({ i, s: stock.get(i.variant_id) }))
    .filter((x: any) => x.s?.manage && x.i.quantity > x.s.available)
    .map((x: any) => `${x.i.title} (үлд: ${x.s.available})`);
  if (short.length) {
    res.status(409).json({ message: `Үлдэгдэл хүрэлцэхгүй: ${short.join(", ")}` });
    return;
  }

  const regionModule = req.scope.resolve(Modules.REGION);
  const regions = await regionModule.listRegions({});
  const region = regions.find((r: any) => r.currency_code === CURRENCY) || regions[0];
  if (!region) {
    res.status(400).json({ message: "Бүс (region) тохируулаагүй байна." });
    return;
  }

  let salesChannelId: string | undefined;
  try {
    const scModule = req.scope.resolve(Modules.SALES_CHANNEL);
    const channels = await scModule.listSalesChannels({});
    salesChannelId = channels[0]?.id;
  } catch { /* optional */ }

  const email = String(body?.email || "").trim() || "offline@naran.mn";

  try {
    const { result } = await createOrderWorkflow(req.scope).run({
      input: {
        region_id: region.id,
        currency_code: region.currency_code,
        email,
        sales_channel_id: salesChannelId,
        items,
        metadata: {
          offline: true,
          payment_method: String(body?.paymentMethod || "cash").slice(0, 40),
          customer_name: String(body?.customerName || "").slice(0, 120) || null,
          phone: String(body?.phone || "").slice(0, 40) || null,
          note: String(body?.note || "").slice(0, 500) || null,
          recorded_by: (req as any).auth_context?.actor_id || null,
        },
      } as any,
    });
    const orderId = (result as any)?.id as string | undefined;
    const total = items.reduce((a: number, b: any) => a + b.unit_price * b.quantity, 0);
    const orderTotal = Number((result as any)?.total) || total;

    // Mark the sale as paid: an offline sale is money already collected. Create a
    // payment collection for the order then mark it captured. Best-effort — a
    // payment hiccup must not undo the recorded order.
    let paid = false;
    try {
      if (orderId) {
        const { result: pcs } = await createOrderPaymentCollectionWorkflow(req.scope).run({
          input: { order_id: orderId, amount: orderTotal },
        });
        const pcId = Array.isArray(pcs) ? (pcs[0] as any)?.id : (pcs as any)?.id;
        if (pcId) {
          await markPaymentCollectionAsPaid(req.scope).run({
            input: {
              payment_collection_id: pcId,
              order_id: orderId,
              captured_by: (req as any).auth_context?.actor_id || undefined,
            },
          });
          paid = true;
        }
      }
    } catch { /* order recorded; payment status left as-is */ }

    // An in-person sale is handed over on the spot — reserve stock, then fulfill,
    // ship and deliver so it ends as Delivered rather than "awaiting fulfillment".
    // Direct orders have no reservations, so we create them first (fulfillment
    // consumes the reservation, which is what decrements managed stock).
    // Best-effort/idempotent.
    let fulfilled = false;
    let reserved = false;
    try {
      if (orderId) {
        await reserveOrderItems(req.scope, orderId);
        reserved = true;
        const f = await fulfillOrder(req.scope, orderId);
        if (f.fulfilled) {
          await shipOrder(req.scope, orderId);
          await deliverOrder(req.scope, orderId);
          fulfilled = true;
        }
      }
    } catch { /* order recorded + paid; fulfillment left as-is */ }

    // Stock: when fulfillment completed it already decremented managed items via
    // the reservation. If the items were reserved but fulfillment failed, the
    // reservation already holds the stock (staff can finish fulfilling in the
    // admin) — decrementing too would count the sale twice. Only when nothing
    // was reserved do we fall back to a manual decrement.
    let stockAdjusted = 0;
    if (!fulfilled && !reserved) {
      try {
        const r = await decrementStockForVariants(req.scope, items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })));
        stockAdjusted = r.adjusted;
      } catch { /* leave stock untouched; sale still recorded */ }
    }

    res.json({
      id: orderId,
      display_id: (result as any)?.display_id ?? null,
      total: orderTotal,
      paid, fulfilled, stockAdjusted,
      // For the printable receipt (server is the source of truth on totals).
      receipt: {
        items: items.map((i: any) => ({ title: i.title, quantity: i.quantity, unit_price: i.unit_price, amount: i.unit_price * i.quantity })),
        total: orderTotal,
        paymentMethod: String(body?.paymentMethod || "cash"),
        customerName: String(body?.customerName || "").slice(0, 120) || null,
        at: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Борлуулалт бүртгэхэд алдаа гарлаа" });
  }
}
