import type { Category, FacetCount, ListResult, Product, User } from "./types";
import { ENRICH, DEFAULT_ENRICH } from "./enrich";
import { TYPE_LABEL } from "./catalog";

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

const FIELDS = "id,title,subtitle,handle,description,thumbnail,metadata,created_at,*categories,*images,*options,*options.values,*variants,*variants.calculated_price,*variants.manage_inventory,*variants.inventory_items.inventory.location_levels.available_quantity";
const H = { "content-type": "application/json", "x-publishable-api-key": PK };

// `revalidate` (seconds) makes the fetch cacheable → the calling page can render
// statically / ISR (fast LCP). Omit → no-store (fresh; carts, auth, orders).
// Cached fetches are tagged so the backend can purge them on demand
// (app/api/revalidate): "cms" for homepage content, "catalog" for the rest.
async function mfetch(path: string, retries = 1, revalidate?: number): Promise<any> {
  const tags = [path.startsWith("cms/") ? "cms" : "catalog"];
  const cacheOpt = typeof revalidate === "number" ? { next: { revalidate, tags } } : { cache: "no-store" as const };
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
  // ENRICH only knows the original demo handles; the real catalog comes from
  // Medusa metadata. Never fall back to DEFAULT_ENRICH's placeholder rating /
  // review count for real products — that would show shoppers invented reviews.
  const known = !!ENRICH[handle];
  const e = ENRICH[handle] || DEFAULT_ENRICH;
  const meta = (m.metadata || {}) as Record<string, any>;
  const brand: string | undefined = meta.brand || m.subtitle || undefined;
  const fragranceType: string | undefined = meta.fragrance_type || undefined;
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
    shape: known ? e.shape : (category === "Gift" ? "giftset" : category === "Body" ? "lotion" : "perfume"),
    gender: e.gender,
    season: e.season,
    price,
    was: known && e.wasMultiplier ? Math.round(price * e.wasMultiplier) : undefined,
    rating: known ? e.rating : 0,
    reviews: known ? e.reviews : 0,
    badge: meta.badge === "New" ? "New" : known ? (e.badge ?? null) : null,
    colors: [e.accent],
    sizes,
    fabric: (fragranceType && TYPE_LABEL[fragranceType]) || (known ? e.fabric : ""),
    shortDesc: description.slice(0, 90),
    description,
    bullets: known ? e.bullets : [],
    specs: known ? e.specs : Object.fromEntries(([
      ["Брэнд", brand],
      ["Төрөл", fragranceType ? TYPE_LABEL[fragranceType] : undefined],
      ["Хэмжээ", sizes.length && sizes[0] !== "One size" ? sizes.join(" / ") : undefined],
    ] as [string, string | undefined][]).filter(([, v]) => v) as [string, string][]),
    brand,
    fragranceType,
    createdAt: m.created_at,
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

// Browse needs the WHOLE (category-filtered) catalog: sorting by price and the
// gender/colour/price filters run on the result, and the shop page paginates
// it. Medusa caps a page at 100, so fetch every page (in parallel, fetch-
// cached for BROWSE_REVALIDATE). Capped so a runaway catalog can't stall SSR.
const BROWSE_CAP = 3000;
async function fetchCatalog(categoryId?: string): Promise<Product[]> {
  const first = await fetchProducts({ categoryId, limit: 100, offset: 0, revalidate: BROWSE_REVALIDATE });
  const offsets: number[] = [];
  for (let off = 100; off < Math.min(first.total, BROWSE_CAP); off += 100) offsets.push(off);
  const rest = await Promise.all(offsets.map(offset =>
    fetchProducts({ categoryId, limit: 100, offset, revalidate: BROWSE_REVALIDATE }).then(r => r.products)));
  return first.products.concat(...rest);
}

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
    list: async (params: Record<string, string | undefined> = {}): Promise<ListResult> => {
      const { category, q, sort, filter, minPrice, maxPrice } = params;
      const wantCat = category && category !== "all" ? category : undefined;
      // Multi-select filters travel as comma lists: ?brand=CHANEL,DIOR&type=EDP
      const brands = (params.brand || "").split(",").map(s => s.trim()).filter(Boolean);
      const types = (params.type || "").split(",").map(s => s.trim()).filter(Boolean);
      const min = Number(minPrice), max = Number(maxPrice);

      // Base set = search results or the whole catalog. Only published products
      // come back from the store API; image-less ones are drafts (hidden by the
      // backend), and search results are re-checked for an image as well.
      const base: Product[] = q ? (await searchProducts(q)).filter(p => !!p.image) : await fetchCatalog();

      // Predicates, so each facet can be counted with all the OTHER filters on.
      const byCat = (p: Product) => !wantCat || p.category === wantCat;
      const byBrand = (p: Product) => !brands.length || (!!p.brand && brands.includes(p.brand));
      const byType = (p: Product) => !types.length || (!!p.fragranceType && types.includes(p.fragranceType));
      const byNew = (p: Product) => filter !== "new" || p.badge === "New";
      const byPrice = (p: Product) =>
        (!minPrice || isNaN(min) || p.price >= min) && (!maxPrice || isNaN(max) || p.price <= max);
      const all = [byCat, byBrand, byType, byNew, byPrice];
      const except = (skip: (p: Product) => boolean) => base.filter(p => all.every(f => f === skip || f(p)));
      const tally = (items: Product[], key: (p: Product) => string | undefined): FacetCount[] => {
        const m = new Map<string, number>();
        for (const p of items) { const k = key(p); if (k) m.set(k, (m.get(k) || 0) + 1); }
        return [...m].map(([k, count]) => ({ key: k, count }));
      };

      let list = base.filter(p => all.every(f => f(p)));
      const byName = (a: Product, b: Product) => a.name.localeCompare(b.name);
      switch (sort) {
        case "price-asc": list.sort((a, b) => a.price - b.price || byName(a, b)); break;
        case "price-desc": list.sort((a, b) => b.price - a.price || byName(a, b)); break;
        case "name": list.sort(byName); break;
        case "brand": list.sort((a, b) => (a.brand || "").localeCompare(b.brand || "") || byName(a, b)); break;
        case "new":
          // "Шинэ"-marked first, then most recently added.
          list.sort((a, b) => Number(b.badge === "New") - Number(a.badge === "New") || (b.createdAt || "").localeCompare(a.createdAt || ""));
          break;
      }

      return {
        data: list,
        total: list.length,
        facets: {
          categories: tally(except(byCat), p => p.category),
          brands: tally(except(byBrand), p => p.brand).sort((a, b) => a.key.localeCompare(b.key)),
          types: tally(except(byType), p => p.fragranceType).sort((a, b) => b.count - a.count),
          newCount: except(byNew).filter(p => p.badge === "New").length,
        },
      };
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
  // Live search suggestions for the header dropdown: visible products only.
  suggest: async (q: string): Promise<{ items: Product[]; total: number }> => {
    const all = (await searchProducts(q)).filter(p => !!p.image);
    return { items: all.slice(0, 6), total: all.length };
  },

  // The single delivery option + fee the admin configured (0 = free).
  delivery: async (): Promise<{ optionId: string | null; fee: number }> => {
    const d = await mfetch("delivery");
    return { optionId: d.option_id ?? null, fee: Math.round(d.fee ?? 0) };
  },

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
    address: { first_name: string; last_name: string; address_1: string; address_2?: string; city: string; postal_code?: string; country_code: string; phone?: string; metadata?: Record<string, string> };
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
    // The admin-configured delivery option is the only one used (no customer choice).
    const wantId = input.shippingOptionId || (await medusa.delivery().catch(() => ({ optionId: null }))).optionId;
    const opt = (wantId && shipping_options.find((o: any) => o.id === wantId)) || shipping_options[0];
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
      shipping_address: { first_name: "Preview", last_name: "", address_1: "-", city: "Ulaanbaatar", country_code: "mn" },
    });
    try {
      const { shipping_options } = await mfetch(`shipping-options?cart_id=${cart.id}`);
      const wantId = input.shippingOptionId || (await medusa.delivery().catch(() => ({ optionId: null }))).optionId;
      const opt = (wantId && shipping_options.find((o: any) => o.id === wantId)) || shipping_options[0];
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
