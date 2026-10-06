import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

// Sales reporting (spec A-24/25/26). Revenue = Σ (unit_price × quantity) from
// line items (same basis as the analytics dashboard). MNT prices are VAT-
// inclusive (Mongolia, 10%), so VAT and net are extracted from the gross.

export const VAT_RATE = 0.1;
const MAX_SCAN = 20000;
const PAGE = 500;

// One cashier's till performance. POS sales carry the staff member who rang
// them up in order.metadata.recorded_by (set by /admin/offline-sale).
export type StaffSales = {
  id: string;
  name: string;
  email: string;
  revenue: number;
  orders: number;
  items: number;
  aov: number;
  discount: number;
  byPayment: Record<string, number>;
  lastSaleAt: string | null;
};

export type SalesReport = {
  from: string | null;
  to: string | null;
  staff: string | null;
  totals: { revenue: number; orders: number; aov: number; net: number; vat: number };
  // Where the money came from. "pos" = rung up at the till, "online" = the
  // storefront. Kept separate because only POS sales have a cashier.
  channels: { pos: { revenue: number; orders: number }; online: { revenue: number; orders: number } };
  byStaff: StaffSales[];
  daily: { date: string; revenue: number; orders: number }[];
  byCategory: { name: string; revenue: number; qty: number }[];
  byProduct: { name: string; revenue: number; qty: number }[];
  scanned: number;
  capped: boolean;
};

// actor_id → a readable cashier name. Missing users (deleted staff) still show
// their id so the figures are never silently dropped from the report.
async function staffNames(scope: { resolve: (k: any) => any }, ids: string[]) {
  const out = new Map<string, { name: string; email: string }>();
  const wanted = ids.filter(Boolean);
  if (!wanted.length) return out;
  try {
    const userModule = scope.resolve(Modules.USER);
    const users: any[] = await userModule.listUsers({ id: wanted } as any, { take: wanted.length });
    for (const u of users || []) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
      out.set(u.id, { name: name || u.email || u.id, email: u.email || "" });
    }
  } catch { /* user module unavailable → fall back to ids */ }
  return out;
}

// productId → category name (first category), for the by-category breakdown.
async function productCategoryMap(scope: { resolve: (k: any) => any }) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const map = new Map<string, string>();
  for (let skip = 0; skip < 50000; skip += 1000) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "categories.name"],
      pagination: { take: 1000, skip },
    });
    const batch = (data || []) as any[];
    for (const p of batch) map.set(p.id, (p.categories?.[0]?.name as string) || "Ангилалгүй");
    if (batch.length < 1000) break;
  }
  return map;
}

export async function salesReport(
  scope: { resolve: (k: any) => any },
  fromISO?: string,
  toISO?: string,
  staffId?: string,
): Promise<SalesReport> {
  const orderModule = scope.resolve(Modules.ORDER);
  const from = fromISO ? new Date(fromISO) : null;
  const to = toISO ? new Date(toISO) : null;
  if (to) to.setHours(23, 59, 59, 999);
  const staff = staffId?.trim() || null;

  const catMap = await productCategoryMap(scope);

  const daily = new Map<string, { revenue: number; orders: number }>();
  const byCat = new Map<string, { revenue: number; qty: number }>();
  const byProd = new Map<string, { revenue: number; qty: number }>();
  type StaffAgg = Omit<StaffSales, "name" | "email" | "aov">;
  const byStaff = new Map<string, StaffAgg>();
  const channels = { pos: { revenue: 0, orders: 0 }, online: { revenue: 0, orders: 0 } };
  let revenue = 0;
  let orders = 0;
  let scanned = 0;
  let capped = false;

  for (let skip = 0; skip < MAX_SCAN; skip += PAGE) {
    const batch: any[] = await orderModule.listOrders(
      {},
      { take: PAGE, skip, order: { created_at: "DESC" } as any, relations: ["items"] as any,
        select: ["id", "created_at", "metadata"] as any },
    );
    for (const o of batch) {
      const created = new Date(o.created_at);
      if (from && created < from) continue;
      if (to && created > to) continue;

      const meta = (o.metadata || {}) as Record<string, any>;
      const isPos = !!meta.offline;
      const cashier = isPos ? String(meta.recorded_by || "") || "unknown" : null;

      let orderRev = 0;
      let orderQty = 0;
      for (const it of o.items || []) {
        orderRev += Math.round(Number(it.unit_price || 0) * Number(it.quantity || 0));
        orderQty += Number(it.quantity || 0);
      }

      // The per-cashier breakdown always covers every till sale in the range —
      // narrowing it to the selected cashier would empty the picker that
      // selected them.
      if (cashier) {
        const a = byStaff.get(cashier) || {
          id: cashier, revenue: 0, orders: 0, items: 0, discount: 0, byPayment: {}, lastSaleAt: null,
        };
        const pay = String(meta.payment_method || "cash");
        a.revenue += orderRev;
        a.orders += 1;
        a.items += orderQty;
        a.discount += Number(meta.discount || 0);
        a.byPayment[pay] = (a.byPayment[pay] || 0) + orderRev;
        if (!a.lastSaleAt || o.created_at > a.lastSaleAt) a.lastSaleAt = o.created_at;
        byStaff.set(cashier, a);
      }

      // Everything below is the report proper, which the cashier filter narrows.
      if (staff && cashier !== staff) continue;
      scanned++;
      const day = created.toISOString().slice(0, 10);
      for (const it of o.items || []) {
        const sub = Math.round(Number(it.unit_price || 0) * Number(it.quantity || 0));
        const qty = Number(it.quantity || 0);
        const pname = it.product_title || it.title || "Бараа";
        const pAgg = byProd.get(pname) || { revenue: 0, qty: 0 };
        pAgg.revenue += sub; pAgg.qty += qty; byProd.set(pname, pAgg);
        const cname = it.product_id ? (catMap.get(it.product_id) || "Ангилалгүй") : "Ангилалгүй";
        const cAgg = byCat.get(cname) || { revenue: 0, qty: 0 };
        cAgg.revenue += sub; cAgg.qty += qty; byCat.set(cname, cAgg);
      }
      const d = daily.get(day) || { revenue: 0, orders: 0 };
      d.revenue += orderRev; d.orders += 1; daily.set(day, d);
      const ch = isPos ? channels.pos : channels.online;
      ch.revenue += orderRev; ch.orders += 1;
      revenue += orderRev; orders++;
    }
    if (batch.length < PAGE) break;
    if (skip + PAGE >= MAX_SCAN) capped = true;
  }

  const net = Math.round(revenue / (1 + VAT_RATE));
  const vat = revenue - net;

  const names = await staffNames(scope, [...byStaff.keys()].filter(id => id !== "unknown"));
  const staffRows: StaffSales[] = [...byStaff.values()]
    .map(a => {
      const u = names.get(a.id);
      return {
        ...a,
        name: u?.name || (a.id === "unknown" ? "Тодорхойгүй" : a.id),
        email: u?.email || "",
        aov: a.orders ? Math.round(a.revenue / a.orders) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    from: from ? from.toISOString().slice(0, 10) : null,
    to: to ? to.toISOString().slice(0, 10) : null,
    staff,
    totals: { revenue, orders, aov: orders ? Math.round(revenue / orders) : 0, net, vat },
    channels,
    byStaff: staffRows,
    daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    byCategory: [...byCat.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue),
    byProduct: [...byProd.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 50),
    scanned,
    capped,
  };
}
