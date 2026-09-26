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

  // ?report=YYYY-MM-DD (or "today") → day-close / Z-report of in-store sales.
  if (req.query.report) {
    const day = String(req.query.report) === "today" ? new Date() : new Date(String(req.query.report));
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id", "display_id", "total", "created_at", "metadata",
        "items.title", "items.quantity", "items.unit_price", "items.total",
      ],
      filters: { created_at: { $gte: start.toISOString(), $lt: end.toISOString() } } as any,
      pagination: { take: 1000, skip: 0, order: { created_at: "DESC" } },
    });
    const sales = (data || []).filter((o: any) => o?.metadata?.offline).map((o: any) => ({
      no: o.display_id ? `NT-${o.display_id}` : o.id,
      at: o.created_at,
      payment: String(o.metadata?.payment_method || "cash"),
      customerName: o.metadata?.customer_name || null,
      discount: Number(o.metadata?.discount || 0),
      total: Number(o.total || 0),
      items: (o.items || []).map((it: any) => ({
        title: it.title, quantity: it.quantity,
        unit_price: Number(it.unit_price || 0), amount: Number((it.total ?? it.unit_price * it.quantity) || 0),
      })),
    }));
    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const sale of sales) {
      const m = byMethod[sale.payment] || { count: 0, total: 0 };
      m.count++; m.total += sale.total; byMethod[sale.payment] = m;
    }
    res.json({
      report: {
        date: start.toISOString().slice(0, 10),
        count: sales.length,
        total: sales.reduce((a: number, s2: any) => a + s2.total, 0),
        byMethod, sales,
      },
    });
    return;
  }

  const q = (req.query.q as string) || "";
  const filters: any = { status: "published" };
  if (q) filters.title = { $ilike: `%${q}%` };

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "subtitle", "thumbnail", "metadata",
      "categories.id", "categories.name", "categories.handle",
      "variants.id", "variants.title", "variants.sku", "variants.manage_inventory",
      "variants.prices.amount", "variants.prices.currency_code",
      "variants.inventory_items.inventory.location_levels.available_quantity",
    ],
    filters,
    // The POS grid loads the catalog once and filters client-side (instant for a
    // cashier), so take the whole published catalog rather than a search page.
    pagination: { take: 300, skip: 0, order: { title: "ASC" } },
  });

  const products = (data || []).map((p: any) => {
    const meta = (p.metadata || {}) as Record<string, any>;
    return {
      id: p.id,
      title: p.title,
      thumbnail: p.thumbnail || "",
      brand: meta.brand || p.subtitle || "",
      gender: typeof meta.gender === "string" ? meta.gender : "",
      categories: (p.categories || []).map((c: any) => ({ id: c.id, name: c.name, handle: c.handle })),
      variants: (p.variants || []).map((v: any) => {
        const mnt = (v.prices || []).find((pr: any) => pr.currency_code === CURRENCY);
        const levels = (v.inventory_items || []).flatMap((ii: any) => ii?.inventory?.location_levels || []);
        const available = levels.reduce((a: number, l: any) => a + Number(l?.available_quantity ?? 0), 0);
        return { id: v.id, title: v.title || p.title, sku: v.sku || "", price: mnt ? Number(mnt.amount) : 0, manage: v.manage_inventory !== false, stock: v.manage_inventory === false ? null : available };
      }),
    };
  });

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

  // Optional order-level discount (MNT), computed on the client from % or amount.
  const rawTotal = items.reduce((a: number, i: any) => a + i.unit_price * i.quantity, 0);
  const discount = Math.min(rawTotal, Math.max(0, Math.round(Number(body?.discount) || 0)));
  // Apply it by scaling line prices to hit (rawTotal − discount); the order
  // total (Analytics/Reports) then equals what the customer actually paid.
  const factor = discount > 0 && rawTotal > 0 ? (rawTotal - discount) / rawTotal : 1;
  const orderItems = items.map((i: any) => ({ ...i, unit_price: Math.max(0, Math.round(i.unit_price * factor)) }));
  const scaledTotal = orderItems.reduce((a: number, i: any) => a + i.unit_price * i.quantity, 0);
  const effectiveDiscount = rawTotal - scaledTotal;

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
        items: orderItems,
        metadata: {
          offline: true,
          payment_method: String(body?.paymentMethod || "cash").slice(0, 40),
          customer_name: String(body?.customerName || "").slice(0, 120) || null,
          phone: String(body?.phone || "").slice(0, 40) || null,
          note: String(body?.note || "").slice(0, 500) || null,
          discount: effectiveDiscount || null,
          discount_code: String(body?.discountCode || "").slice(0, 60) || null,
          recorded_by: (req as any).auth_context?.actor_id || null,
        },
      } as any,
    });
    const orderId = (result as any)?.id as string | undefined;
    const orderTotal = Number((result as any)?.total) || scaledTotal;

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
        subtotal: rawTotal,
        discount: effectiveDiscount || 0,
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
