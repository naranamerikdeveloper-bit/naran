import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createOrderWorkflow,
  createOrderPaymentCollectionWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows";
import { buildTicket, decrementStockForVariants, pricesForVariants, stockForVariants } from "../../../lib/catalog";
import { posClaimInvoice, posReleaseInvoice } from "../../../lib/pos-payment";
import { reserveOrderItems, fulfillOrder, shipOrder, deliverOrder } from "../../../lib/fulfillment";

const CURRENCY = "mnt";

// Product picker paging. DEFAULT_PAGE is what one screen of the POS grid shows
// before "load more". The AUDIENCE_SCAN_* pair bounds the fallback that filters
// product metadata in JS, used only if this Medusa version will not build the
// JSONB query itself.
const DEFAULT_PAGE = 60;
const AUDIENCE_SCAN_PAGE = 500;
const AUDIENCE_SCAN_MAX = 50_000;

const POS_FIELDS = [
  "id", "title", "subtitle", "thumbnail", "metadata",
  "categories.id", "categories.name", "categories.handle",
  "variants.id", "variants.title", "variants.sku", "variants.manage_inventory",
  "variants.prices.amount", "variants.prices.currency_code",
  "variants.inventory_items.inventory.location_levels.available_quantity",
];

// The storefront's audience filters, expressed as the product metadata they
// read. Keeping them here means the till and the website agree on what
// "Эрэгтэй" or "Шинэ ирсэн" means.
const AUDIENCE_META: Record<string, Record<string, string>> = {
  men: { gender: "Men" },
  women: { gender: "Women" },
  new: { badge: "New" },
  gift: { fragrance_type: "Set" },
};

// One product as the POS grid needs it: a card, its variants, their prices and
// what is left on the shelf.
function toPosProduct(p: any) {
  const meta = (p.metadata || {}) as Record<string, any>;
  return {
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail || "",
    brand: meta.brand || p.subtitle || "",
    gender: typeof meta.gender === "string" ? meta.gender : "",
    isNew: meta.badge === "New",
    isGift: meta.fragrance_type === "Set" || (p.categories || []).some((c: any) => c.handle === "gift"),
    categories: (p.categories || []).map((c: any) => ({ id: c.id, name: c.name, handle: c.handle })),
    variants: (p.variants || []).map((v: any) => {
      const mnt = (v.prices || []).find((pr: any) => pr.currency_code === CURRENCY);
      const levels = (v.inventory_items || []).flatMap((ii: any) => ii?.inventory?.location_levels || []);
      const available = levels.reduce((a: number, l: any) => a + Number(l?.available_quantity ?? 0), 0);
      return {
        id: v.id,
        title: v.title || p.title,
        sku: v.sku || "",
        price: mnt ? Number(mnt.amount) : 0,
        manage: v.manage_inventory !== false,
        stock: v.manage_inventory === false ? null : available,
      };
    }),
  };
}

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
    const offline = (data || []).filter((o: any) => o?.metadata?.offline);
    // Who rang each sale up. The ids on the orders are resolved to names in one
    // lookup so the Z-report reads as staff names, not actor ids.
    const names = new Map<string, string>();
    const ids = [...new Set(offline.map((o: any) => String(o.metadata?.recorded_by || "")).filter(Boolean))];
    if (ids.length) {
      try {
        const users: any[] = await req.scope.resolve(Modules.USER).listUsers({ id: ids } as any, { take: ids.length });
        for (const u of users || []) {
          names.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || u.id);
        }
      } catch { /* fall back to ids */ }
    }
    const sales = offline.map((o: any) => {
      const by = String(o.metadata?.recorded_by || "");
      return {
        no: o.display_id ? `NT-${o.display_id}` : o.id,
        at: o.created_at,
        payment: String(o.metadata?.payment_method || "cash"),
        customerName: o.metadata?.customer_name || null,
        discount: Number(o.metadata?.discount || 0),
        total: Number(o.total || 0),
        cashierId: by || null,
        cashier: by ? names.get(by) || by : "Тодорхойгүй",
        items: (o.items || []).map((it: any) => ({
          title: it.title, quantity: it.quantity,
          unit_price: Number(it.unit_price || 0), amount: Number((it.total ?? it.unit_price * it.quantity) || 0),
        })),
      };
    });
    const byMethod: Record<string, { count: number; total: number }> = {};
    const byStaff: Record<string, { count: number; total: number }> = {};
    for (const sale of sales) {
      const m = byMethod[sale.payment] || { count: 0, total: 0 };
      m.count++; m.total += sale.total; byMethod[sale.payment] = m;
      const s = byStaff[sale.cashier] || { count: 0, total: 0 };
      s.count++; s.total += sale.total; byStaff[sale.cashier] = s;
    }
    res.json({
      report: {
        date: start.toISOString().slice(0, 10),
        count: sales.length,
        total: sales.reduce((a: number, s2: any) => a + s2.total, 0),
        byMethod, byStaff, sales,
      },
    });
    return;
  }

  // --- Product picker ------------------------------------------------------
  //
  // The grid used to pull the whole catalogue once (capped at 300) and filter
  // it in the browser. That does not survive a 10,000-product shop: payload,
  // memory and render time all grow with the catalogue. Search, category and
  // paging now happen in the database, so the till behaves the same whether the
  // shop carries 75 products or 50,000.
  const q = String(req.query.q ?? "").trim();
  const cat = String(req.query.cat ?? "").trim();
  const aud = String(req.query.aud ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || DEFAULT_PAGE));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const base: any = { status: "published" };
  if (cat) base.categories = { handle: cat };
  if (q) base.title = { $ilike: `%${q}%` };

  const page = (filters: any, take: number, skip: number) =>
    query.graph({
      entity: "product",
      fields: POS_FIELDS,
      filters,
      pagination: { take, skip, order: { title: "ASC" } },
    });

  const audMeta = AUDIENCE_META[aud];
  let rows: any[] = [];
  let count = 0;

  if (audMeta) {
    // The audience chips key off product metadata (JSONB). Postgres can filter
    // that, but rather than bet the till on this Medusa version building the
    // query, a failure falls back to filtering a bounded page in JS.
    let filtered = false;
    try {
      const r: any = await page({ ...base, metadata: audMeta }, limit, offset);
      rows = r.data || [];
      count = r.metadata?.count ?? rows.length;
      filtered = true;
    } catch {
      filtered = false;
    }
    if (!filtered) {
      // Page the whole catalogue rather than sampling the first N: a cap here
      // would silently hide products from the till, which is worse than being
      // slow on a path that should never run.
      const [k, v] = Object.entries(audMeta)[0];
      const all: any[] = [];
      for (let skip = 0; skip < AUDIENCE_SCAN_MAX; skip += AUDIENCE_SCAN_PAGE) {
        const r: any = await page(base, AUDIENCE_SCAN_PAGE, skip);
        const batch: any[] = r.data || [];
        for (const p of batch) if ((p.metadata || {})[k] === v) all.push(p);
        if (batch.length < AUDIENCE_SCAN_PAGE) break;
      }
      count = all.length;
      rows = all.slice(offset, offset + limit);
    }
  } else {
    const r: any = await page(base, limit, offset);
    rows = r.data || [];
    count = r.metadata?.count ?? rows.length;
  }

  // A scanned barcode is an exact SKU, not a title fragment — look it up too so
  // scanning finds the product even when its name shares nothing with the code.
  if (q && offset === 0) {
    try {
      const r: any = await page({ status: "published", variants: { sku: q } }, 5, 0);
      const have = new Set(rows.map((p: any) => p.id));
      const extra = (r.data || []).filter((p: any) => !have.has(p.id));
      if (extra.length) {
        rows = [...extra, ...rows].slice(0, limit);
        count += extra.length;
      }
    } catch { /* SKU lookup is a bonus; the title search already answered */ }
  }

  const products = rows.map(toPosProduct);

  // The category row. Sent only when asked (once, on load): a count per
  // category is one cheap COUNT each, and the cashier does not need them again
  // on every keystroke. A cashier cannot call /admin/product-categories — the
  // POS lock blocks it — so the list comes from here.
  let categories: { handle: string; name: string; count: number }[] | undefined;
  let allCount: number | undefined;
  if (req.query.facets) {
    try {
      const productModule = req.scope.resolve(Modules.PRODUCT);
      const [, total] = await productModule.listAndCountProducts(
        { status: "published" } as any,
        { take: 1, select: ["id"] as any },
      );
      allCount = total;
    } catch { /* the "Бүгд" card simply shows nothing */ }
  }
  if (req.query.facets) {
    const { data: cats } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle"],
      pagination: { take: 100, skip: 0, order: { name: "ASC" } },
    });
    const productModule = req.scope.resolve(Modules.PRODUCT);
    categories = await Promise.all(
      (cats || []).map(async (c: any) => {
        let n = 0;
        try {
          const [, total] = await productModule.listAndCountProducts(
            { status: "published", categories: { id: c.id } } as any,
            { take: 1, select: ["id"] as any },
          );
          n = total;
        } catch { /* a count we cannot get is shown as zero, not an error */ }
        return { handle: c.handle, name: c.name, count: n };
      }),
    );
    categories = categories.filter(c => c.count > 0).sort((a, b) => b.count - a.count);
  }

  res.json({
    products, count, limit, offset,
    ...(categories ? { categories } : {}),
    ...(allCount !== undefined ? { allCount } : {}),
  });
}

// POST /admin/offline-sale — record an in-person / offline sale as a Medusa
// order so it shows up alongside online sales in Orders, Analytics and Reports.
// Body: { items:[{variant_id, quantity, title, unit_price}], email?, customerName?,
//         phone?, paymentMethod?, note? }
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as any;
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  // `unit_price` from the body is deliberately ignored — see pricesForVariants.
  const items = rawItems
    .map((i: any) => ({
      variant_id: String(i.variant_id || ""),
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      title: String(i.title || "Бараа").slice(0, 200),
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

  // Prices come from the catalogue, never the request body, and the discount is
  // applied by scaling line prices so the order total equals what was paid.
  const prices = await pricesForVariants(req.scope, items.map((i: any) => i.variant_id));
  const unpriced = items.filter((i: any) => !prices.has(i.variant_id));
  if (unpriced.length) {
    res.status(409).json({ message: `Үнэгүй бараа байна: ${unpriced.map((m: any) => m.title).join(", ")}` });
    return;
  }
  const { priced, rawTotal, orderItems, scaledTotal, effectiveDiscount } = buildTicket(items, prices, body?.discount);

  // QPay: the sale is only booked once the gateway confirms THIS invoice is paid
  // AND the paid amount matches the ticket — so a till can never record an order
  // against an unpaid, cancelled or cheaper invoice.
  const qpayInvoiceId = String(body?.qpayInvoiceId || "").trim();
  // Set once the gateway hands us the one-shot claim, so a later failure can
  // release it (see the outer catch).
  let claimedInvoiceId: string | null = null;
  if (String(body?.paymentMethod || "") === "qpay") {
    if (!qpayInvoiceId) {
      res.status(400).json({ message: "QPay нэхэмжлэх олдсонгүй." });
      return;
    }
    // Refuse a payment that already produced an order — belt and braces on top
    // of the gateway's one-shot claim.
    const { data: dupes } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: ["id", "metadata"],
      pagination: { take: 200, skip: 0, order: { created_at: "DESC" } },
    });
    if ((dupes || []).some((o: any) => o?.metadata?.qpay_invoice_id === qpayInvoiceId)) {
      res.status(409).json({ message: "Энэ төлбөрөөр аль хэдийн борлуулалт бүртгэгдсэн байна." });
      return;
    }
    try {
      // Atomic: only the first caller is allowed to book this payment.
      await posClaimInvoice(qpayInvoiceId, scaledTotal);
      claimedInvoiceId = qpayInvoiceId;
    } catch (e: any) {
      const status = Number(e?.status) || 502;
      res.status(status === 404 ? 409 : status).json({ message: e?.message || "Төлбөр шалгаж чадсангүй" });
      return;
    }
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
        items: orderItems,
        metadata: {
          offline: true,
          payment_method: String(body?.paymentMethod || "cash").slice(0, 40),
          customer_name: String(body?.customerName || "").slice(0, 120) || null,
          phone: String(body?.phone || "").slice(0, 40) || null,
          note: String(body?.note || "").slice(0, 500) || null,
          discount: effectiveDiscount || null,
          discount_code: String(body?.discountCode || "").slice(0, 60) || null,
          qpay_invoice_id: qpayInvoiceId || null,
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
        // reserveOrderItems legitimately reserves NOTHING (no stock location, or
        // a managed variant with no inventory link). Treating that as "reserved"
        // skipped the manual decrement below, so stock was never reduced and the
        // sale silently oversold. Only a real reservation counts.
        const r = await reserveOrderItems(req.scope, orderId);
        reserved = Number((r as any)?.reserved ?? 0) > 0;
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
        items: priced.map((i: any) => ({ title: i.title, quantity: i.quantity, unit_price: i.unit_price, amount: i.unit_price * i.quantity })),
        subtotal: rawTotal,
        discount: effectiveDiscount || 0,
        total: orderTotal,
        paymentMethod: String(body?.paymentMethod || "cash"),
        customerName: String(body?.customerName || "").slice(0, 120) || null,
        at: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    // The payment was claimed but the sale didn't record — hand the claim back
    // so the cashier can retry against the SAME invoice instead of charging the
    // customer a second time.
    if (claimedInvoiceId) await posReleaseInvoice(claimedInvoiceId);
    res.status(500).json({ message: e?.message || "Борлуулалт бүртгэхэд алдаа гарлаа" });
  }
}
