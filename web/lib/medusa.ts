import type { Category, Product, User } from "./types";
import { ENRICH, DEFAULT_ENRICH } from "./enrich";

// Medusa category handle → storefront Category key. Taxonomy lives in Medusa
// (product categories), so this scales to a 10k+ catalog with no per-product map.
const HANDLE_TO_CATEGORY: Record<string, Category> = {
  fragrance: "Fragrance", skincare: "Skincare", makeup: "Makeup", body: "Body", gift: "Gift",
};

const URL = process.env.NEXT_PUBLIC_MEDUSA_URL || "http://localhost:9000";
const PK = process.env.NEXT_PUBLIC_MEDUSA_PK || "pk_e1804f58f4011bb9e1dafab18baff34de60dd2be69bd20f6c7cd75e14780208d";
const REGION = process.env.NEXT_PUBLIC_MEDUSA_REGION || "reg_01M0T6Q2HE0A9R8MHXTXDR3P29";
// When set, free-text search routes through the MeiliSearch plugin endpoint
// (typo-tolerant, fast at 10k+). Falls back to Medusa's built-in `q` on any error.
const MEILI_ENABLED = (process.env.NEXT_PUBLIC_MEILISEARCH ?? "") === "1";

const FIELDS = "id,title,handle,description,thumbnail,*categories,*images,*options,*options.values,*variants,*variants.calculated_price,*variants.manage_inventory,*variants.inventory_items.inventory.location_levels.available_quantity";
const H = { "content-type": "application/json", "x-publishable-api-key": PK };

// `revalidate` (seconds) makes the fetch cacheable → the calling page can render
// statically / ISR (fast LCP). Omit → no-store (fresh; carts, auth, orders).
async function mfetch(path: string, retries = 1, revalidate?: number): Promise<any> {
  const cacheOpt = typeof revalidate === "number" ? { next: { revalidate } } : { cache: "no-store" as const };
  try {
    const res = await fetch(`${URL}/store/${path}`, { headers: H, ...cacheOpt });
    if (!res.ok) throw new Error(`Medusa ${res.status}`);
    return res.json();
  } catch (e) {
    // Retry once — smooths over transient backend hiccups / cold starts so a
    // single slow request doesn't 500 the whole page.
    if (retries > 0) { await new Promise(r => setTimeout(r, 350)); return mfetch(path, retries - 1, revalidate); }
    throw e;
  }
}
// ISR windows (seconds): browse/category lists vs single product page.
const BROWSE_REVALIDATE = 120;
const PRODUCT_REVALIDATE = 300;
const mpost = async (path: string, body: any) => {
  const res = await fetch(`${URL}/store/${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Medusa ${res.status}`);
  return data;
};

const mapCustomer = (c: any): User => ({
  id: c.id,
  email: c.email,
  firstName: c.first_name || c.email?.split("@")[0] || "",
  lastName: c.last_name || "",
  phone: c.phone || "",
});

async function authPost(path: string, body: any) {
  const res = await fetch(`${URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Auth ${res.status}`);
  return data;
}
async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${URL}/store/customers/me`, { headers: { ...H, authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.customer) throw new Error("Could not load account");
  return mapCustomer(data.customer);
}

// POST that optionally carries the customer's auth token (links carts to the customer).
async function mpostAuth(path: string, body: any, token?: string) {
  const headers = token ? { ...H, authorization: `Bearer ${token}` } : H;
  const res = await fetch(`${URL}/store/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Medusa ${res.status}`);
  return data;
}

// A customer's real order, mapped to the storefront's order shape.
export type CustomerOrder = {
  id: string;         // display id like NT-4 (for the customer)
  orderId: string;    // Medusa order id (for returns)
  total: number;
  status: string;
  createdAt: string;
  items: { id: string; name: string; quantity: number; amount: number }[];
};
async function fetchOrders(token: string): Promise<CustomerOrder[]> {
  const q = new URLSearchParams({
    limit: "50", order: "-created_at",
    fields: "id,display_id,total,currency_code,created_at,status,fulfillment_status,*items",
  });
  const res = await fetch(`${URL}/store/orders?${q}`, { headers: { ...H, authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Could not load orders");
  return (data.orders || []).map((o: any): CustomerOrder => ({
    id: o.display_id ? `NT-${o.display_id}` : o.id,
    orderId: o.id,
    total: Math.round(o.total ?? 0),
    // Medusa fulfillment_status drives the visible order state.
    status: /delivered/.test(o.fulfillment_status) ? "delivered"
      : /shipped|fulfilled/.test(o.fulfillment_status) ? "shipped" : "processing",
    createdAt: o.created_at,
    items: (o.items || []).map((it: any) => ({
      id: it.id,
      name: it.product_title || it.title || "Бараа",
      quantity: it.quantity,
      amount: Math.round(Number(it.total ?? (it.unit_price * it.quantity)) || 0),
    })),
  }));
}

function map(m: any): Product {
  const handle = m.handle as string;
  const e = ENRICH[handle] || DEFAULT_ENRICH;
  // Category comes from Medusa's product categories (source of truth); the
  // enrich map is a fallback for products that predate the taxonomy.
  const catHandle = (m.categories || [])[0]?.handle as string | undefined;
  const category: Category = (catHandle && HANDLE_TO_CATEGORY[catHandle]) || e.category;
  const prices = (m.variants || [])
    .map((v: any) => v?.calculated_price?.calculated_amount)
    .filter((n: any) => typeof n === "number");
  const price = prices.length ? Math.round(Math.min(...prices)) : 0;
  // Variant option: match common titles, else fall back to the first option that has values.
  const sizeOpt = (m.options || []).find((o: any) => ["size", "хэмжээ", "хувилбар", "өнгө"].includes(o.title?.toLowerCase()))
    || (m.options || []).find((o: any) => (o.values?.length ?? 0) > 0);
  const sizes = sizeOpt?.values?.map((v: any) => v.value) ?? ["One size"];
  const description = m.description || "";

  const variantStock = (v: any): number => {
    if (v?.manage_inventory === false) return 9999;
    const levels = (v?.inventory_items || []).flatMap((ii: any) => ii?.inventory?.location_levels || []);
    return levels.reduce((a: number, l: any) => a + (l?.available_quantity ?? 0), 0);
  };
  const variants = (m.variants || []).map((v: any) => {
    const amt = v?.calculated_price?.calculated_amount;
    return { id: v.id, size: v.title, stock: variantStock(v), price: typeof amt === "number" ? Math.round(amt) : undefined };
  });
  const stock = variants.reduce((a: number, v: any) => a + v.stock, 0);
  // Real gallery images: thumbnail first, then any product images (de-duped).
  const images: string[] = Array.from(new Set(
    [m.thumbnail, ...((m.images || []).map((x: any) => x?.url))].filter(Boolean)
  ));

  return {
    id: handle,
    slug: handle,
    name: m.title,
    category,
    shape: e.shape,
    gender: e.gender,
    season: e.season,
    price,
    was: e.wasMultiplier ? Math.round(price * e.wasMultiplier) : undefined,
    rating: e.rating,
    reviews: e.reviews,
    badge: e.badge ?? null,
    colors: [e.accent],
    sizes,
    fabric: e.fabric,
    shortDesc: description.slice(0, 90),
    description,
    bullets: e.bullets,
    specs: e.specs,
    stock,
    accent: e.accent,
    image: images[0],
    images,
    variants,
  };
}

// Server-side product fetch. Passing `q` runs Medusa's full-text search, which
// scales to large catalogs (10,000+) — the storefront never loads everything.
async function fetchProducts(opts: { q?: string; limit?: number; offset?: number; categoryId?: string; revalidate?: number } = {}): Promise<{ products: Product[]; total: number }> {
  const p = new URLSearchParams({ limit: String(opts.limit ?? 100), offset: String(opts.offset ?? 0), region_id: REGION, fields: FIELDS });
  if (opts.q) p.set("q", opts.q);
  if (opts.categoryId) p.append("category_id[]", opts.categoryId);
  const res = await mfetch(`products?${p.toString()}`, 1, opts.revalidate);
  return { products: (res.products || []).map(map), total: res.count ?? (res.products?.length ?? 0) };
}
const fetchAll = async (): Promise<Product[]> => (await fetchProducts()).products;

// Free-text search. Prefers MeiliSearch (typo-tolerant) via the plugin's store
// endpoint, which hydrates full products (with prices). Any failure — or Meili
// disabled — falls back to Medusa's built-in `q` search so search never breaks.
async function searchProducts(q: string): Promise<Product[]> {
  if (MEILI_ENABLED) {
    try {
      const p = new URLSearchParams({ query: q, region_id: REGION, fields: FIELDS, limit: "100" });
      const res = await mfetch(`meilisearch/products?${p.toString()}`);
      return (res.products || []).map(map);
    } catch { /* fall through to built-in search */ }
  }
  return (await fetchProducts({ q })).products;
}

// Resolve storefront Category key → Medusa category id (cached for the session).
// Lets browse filter server-side (category_id[]) instead of loading everything.
let _catIds: Promise<Record<string, string>> | null = null;
function categoryIds(): Promise<Record<string, string>> {
  if (!_catIds) _catIds = (async () => {
    try {
      const res = await mfetch(`product-categories?limit=100&fields=id,handle`, 1, 3600);
      const out: Record<string, string> = {};
      for (const c of (res.product_categories || [])) {
        const key = HANDLE_TO_CATEGORY[c.handle];
        if (key) out[key] = c.id;
      }
      return out;
    } catch { return {}; }
  })();
  return _catIds;
}

export const medusa = {
  products: {
    list: async (params: Record<string, string | undefined> = {}) => {
      const { category, q, sort, gender, filter, color, tech, minPrice, maxPrice } = params;
      const wantCat = category && category !== "all" ? category : undefined;
      let list: Product[];
      if (q) {
        // Free-text search (MeiliSearch when enabled); category narrows the result set.
        list = await searchProducts(q);
        if (wantCat) list = list.filter(p => p.category === wantCat);
      } else {
        // Browse: category resolves to a Medusa id → filtered server-side (scales to 10k+).
        const categoryId = wantCat ? (await categoryIds())[wantCat] : undefined;
        list = (await fetchProducts({ categoryId, revalidate: BROWSE_REVALIDATE })).products;
        if (wantCat && !categoryId) list = list.filter(p => p.category === wantCat);
      }
      // A gender page also shows Unisex pieces.
      if (gender) list = list.filter(p => p.gender === gender || p.gender === "Unisex");
      if (filter === "new") list = list.filter(p => p.badge === "New");
      if (filter === "sale") list = list.filter(p => p.badge === "Sale" || p.was != null);
      if (color) { const c = color.toLowerCase(); list = list.filter(p => p.colors.some(x => x.toLowerCase() === c) || p.accent.toLowerCase() === c); }
      if (tech) { const n = tech.toLowerCase(); list = list.filter(p => p.fabric.toLowerCase().includes(n) || p.bullets.some(b => b.toLowerCase().includes(n))); }
      const min = Number(minPrice), max = Number(maxPrice);
      if (minPrice && !isNaN(min)) list = list.filter(p => p.price >= min);
      if (maxPrice && !isNaN(max)) list = list.filter(p => p.price <= max);
      // (free-text `q` already applied server-side)
      switch (sort) {
        case "price-asc": list.sort((a, b) => a.price - b.price); break;
        case "price-desc": list.sort((a, b) => b.price - a.price); break;
        case "rating": list.sort((a, b) => b.rating - a.rating); break;
        case "new": list = list.filter(p => p.badge === "New").concat(list.filter(p => p.badge !== "New")); break;
      }
      return { data: list, total: list.length };
    },
    featured: async () => {
      const { data } = await medusa.products.list({});
      return { data: data.slice(0, 8) };
    },
    get: async (idOrSlug: string) => {
      const q = new URLSearchParams({ handle: idOrSlug, region_id: REGION, fields: FIELDS });
      const { products } = await mfetch(`products?${q.toString()}`, 1, PRODUCT_REVALIDATE);
      const product = products?.[0] ? map(products[0]) : null;
      if (!product) throw new Error("Product not found");
      // Related = same category, fetched server-side by category id (scales to 10k+).
      const relCatId = (await categoryIds())[product.category];
      const pool = relCatId
        ? (await fetchProducts({ categoryId: relCatId, limit: 8, revalidate: PRODUCT_REVALIDATE })).products
        : (await fetchProducts({ revalidate: PRODUCT_REVALIDATE })).products;
      const related = pool.filter(p => p.id !== product.id && p.category === product.category).slice(0, 4);
      return { data: product, related };
    },
  },

  auth: {
    login: async (email: string, password: string) => {
      const { token } = await authPost("/auth/customer/emailpass", { email, password });
      if (!token) throw new Error("Invalid credentials");
      return { token, user: await fetchMe(token) };
    },
    signup: async (data: { firstName: string; lastName: string; email: string; password: string }) => {
      const reg = await authPost("/auth/customer/emailpass/register", { email: data.email, password: data.password });
      const regToken = reg.token;
      if (!regToken) throw new Error("Could not register");
      await fetch(`${URL}/store/customers`, {
        method: "POST",
        headers: { ...H, authorization: `Bearer ${regToken}` },
        body: JSON.stringify({ email: data.email, first_name: data.firstName, last_name: data.lastName }),
      });
      const { token } = await authPost("/auth/customer/emailpass", { email: data.email, password: data.password });
      return { token, user: await fetchMe(token) };
    },
    me: async (token: string) => ({ user: await fetchMe(token) }),
    // Request a password-reset link. Medusa emits `auth.password_reset`; our
    // subscriber emails the storefront link. Always resolves (201, no body) so
    // we never leak whether the email exists.
    resetRequest: async (email: string) => {
      await authPost("/auth/customer/emailpass/reset-password", { identifier: email });
      return { ok: true };
    },
    // Set a new password using the token from the reset email. The token is a
    // short-lived JWT sent as a Bearer credential; the body carries the new password.
    resetConfirm: async (token: string, password: string) => {
      const res = await fetch(`${URL}/auth/customer/emailpass/update`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || "Холбоос хүчингүй эсвэл хугацаа дууссан байна.");
      }
      return { ok: true };
    },
  },

  // Authenticated customer data.
  customers: {
    // Real order history for the logged-in customer.
    orders: async (token: string) => ({ data: await fetchOrders(token) }),
    // Saved addresses (from the customer record).
    addresses: async (token: string) => {
      const res = await fetch(`${URL}/store/customers/me?fields=*addresses`, { headers: { ...H, authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not load addresses");
      return { data: (data.customer?.addresses || []) as any[] };
    },
    // Request a return for delivered items. Fetches the return shipping option
    // (via our /store/return-options route) and posts to /store/returns.
    createReturn: async (input: { token?: string; orderId: string; items: { id: string; quantity: number }[]; note?: string }) => {
      const { return_options } = await mfetch(`return-options`);
      const opt = (return_options || [])[0];
      if (!opt) throw new Error("Буцаалтын хүргэлт тохируулаагүй байна.");
      const data = await mpostAuth("returns", {
        order_id: input.orderId,
        items: input.items.map(i => ({ id: i.id, quantity: i.quantity })),
        return_shipping: { option_id: opt.id },
        ...(input.note ? { note: input.note } : {}),
      }, input.token);
      return { id: data.return?.id, status: data.return?.status ?? "requested" };
    },
    // GDPR "right to erasure" — flag the account for deletion (admin processes it).
    requestDeletion: async (token: string) => {
      const res = await fetch(`${URL}/store/customers/me/deletion-request`, {
        method: "POST", headers: { ...H, authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Хүсэлт илгээж чадсангүй");
      return data;
    },
    // Update the customer's profile (name / phone).
    update: async (token: string, patch: { firstName?: string; lastName?: string; phone?: string }) => {
      const res = await fetch(`${URL}/store/customers/me`, {
        method: "POST",
        headers: { ...H, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(patch.firstName !== undefined ? { first_name: patch.firstName } : {}),
          ...(patch.lastName !== undefined ? { last_name: patch.lastName } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.customer) throw new Error(data?.message || "Could not update profile");
      return { user: mapCustomer(data.customer) };
    },
  },

  // Real shipping options for the given items, priced by Medusa (single source
  // of truth — the checkout renders these instead of hardcoded methods/prices).
  shippingQuote: async (items: { variantId: string; quantity: number }[]): Promise<{ id: string; name: string; amount: number }[]> => {
    const { cart } = await mpost("carts", {
      region_id: REGION,
      items: items.map(i => ({ variant_id: i.variantId, quantity: i.quantity })),
    });
    const { shipping_options } = await mfetch(`shipping-options?cart_id=${cart.id}`);
    return (shipping_options || [])
      .map((o: any) => ({ id: o.id, name: o.name as string, amount: Math.round(o.amount ?? 0) }))
      .sort((a: any, b: any) => a.amount - b.amount);
  },

  // Build a Medusa cart up to (but not including) completion. The order is
  // completed server-side by the Wire webhook/poll once payment succeeds.
  prepareCart: async (input: {
    email: string;
    items: { variantId: string; quantity: number }[];
    shippingMethod?: "standard" | "express";
    address: { first_name: string; last_name: string; address_1: string; city: string; postal_code: string; country_code: string; phone?: string };
    token?: string; // logged-in customer → link the order to their account
    promoCode?: string; // optional coupon applied before payment
    shippingOptionId?: string; // explicit option (from the dynamic quote)
  }) => {
    const { cart } = await mpostAuth("carts", {
      region_id: REGION,
      email: input.email,
      items: input.items.map(i => ({ variant_id: i.variantId, quantity: i.quantity })),
    }, input.token);
    await mpostAuth(`carts/${cart.id}`, {
      email: input.email,
      shipping_address: input.address,
      billing_address: input.address,
    }, input.token);
    const { shipping_options } = await mfetch(`shipping-options?cart_id=${cart.id}`);
    const wantExpress = input.shippingMethod === "express";
    const opt = (input.shippingOptionId && shipping_options.find((o: any) => o.id === input.shippingOptionId))
      || shipping_options.find((o: any) => (wantExpress ? /express/i : /standard/i).test(o.name))
      || shipping_options[0];
    if (!opt) throw new Error("No shipping option available");
    await mpost(`carts/${cart.id}/shipping-methods`, { option_id: opt.id });
    // Apply coupon after shipping so both item- and shipping-target promos compute.
    if (input.promoCode) {
      try { await mpost(`carts/${cart.id}/promotions`, { promo_codes: [input.promoCode] }); } catch { /* invalid code → ignore, charge full */ }
    }
    const { payment_collection } = await mpost("payment-collections", { cart_id: cart.id });
    await mpost(`payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" });
    const updated = await mfetch(`carts/${cart.id}`);
    return { cartId: cart.id, total: Math.round(updated.cart?.total ?? cart.total ?? 0) };
  },

  // Validate a coupon and preview the discount on a throwaway cart. Medusa is
  // authoritative here and again at prepareCart, so the preview matches the charge.
  previewPromo: async (input: {
    items: { variantId: string; quantity: number }[];
    shippingMethod?: "standard" | "express";
    shippingOptionId?: string;
    promoCode: string;
  }) => {
    const code = input.promoCode.trim();
    const { cart } = await mpost("carts", {
      region_id: REGION,
      items: input.items.map(i => ({ variant_id: i.variantId, quantity: i.quantity })),
    });
    // Minimal MN address + shipping method so FREESHIP-style promos can compute.
    await mpost(`carts/${cart.id}`, {
      shipping_address: { first_name: "Preview", last_name: "", address_1: "-", city: "Ulaanbaatar", postal_code: "14200", country_code: "mn" },
    });
    try {
      const { shipping_options } = await mfetch(`shipping-options?cart_id=${cart.id}`);
      const wantExpress = input.shippingMethod === "express";
      const opt = (input.shippingOptionId && shipping_options.find((o: any) => o.id === input.shippingOptionId))
        || shipping_options.find((o: any) => (wantExpress ? /express/i : /standard/i).test(o.name))
        || shipping_options[0];
      if (opt) await mpost(`carts/${cart.id}/shipping-methods`, { option_id: opt.id });
    } catch { /* shipping optional for preview */ }
    const res = await mpost(`carts/${cart.id}/promotions`, { promo_codes: [code] });
    const c = res.cart || {};
    const valid = (c.promotions || []).some((p: any) => (p.code || "").toUpperCase() === code.toUpperCase());
    return {
      valid,
      code: code.toUpperCase(),
      discountTotal: Math.round(c.discount_total ?? 0),
      shippingTotal: Math.round(c.shipping_total ?? 0),
      itemTotal: Math.round(c.item_total ?? 0),
      total: Math.round(c.total ?? 0),
    };
  },

  // (Removed dead `checkout()` — direct system-provider completion. The live flow
  // is prepareCart + Wire settlement in the Express gateway; this was unused and
  // sent no order confirmation.)

  // Admin-editable homepage content (CMS, spec A4). Returns null on any failure
  // so the homepage always falls back to its built-in defaults.
  homepageContent: async (): Promise<HomepageCms | null> => {
    try {
      const { content } = await mfetch("cms/homepage", 1, BROWSE_REVALIDATE);
      return content as HomepageCms;
    } catch {
      return null;
    }
  },
};

export type CmsBi = { mn: string; en: string };
export type CmsSlide = { kicker: CmsBi; top: CmsBi; accent: CmsBi; desc: CmsBi; img: string; href: string };
export type CmsPromo = { enabled: boolean; kicker: CmsBi; title: CmsBi; desc: CmsBi; cta: CmsBi; href: string; img: string };
export type HomepageCms = { hero: CmsSlide[]; promo: CmsPromo };
