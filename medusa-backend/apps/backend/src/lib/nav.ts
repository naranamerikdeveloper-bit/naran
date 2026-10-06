import { setStoreMeta } from "./store-meta";
import { Modules } from "@medusajs/framework/utils";
import type { Bi } from "./cms";

// Owner-editable storefront navigation (header + footer categories).
//
// Lives on Store.metadata.cms_nav, written through setStoreMeta so it can never
// clobber the other store-metadata keys (cms_homepage, naran_audit, …).
//
// Each entry is one menu item. Built-in items keep an `i18nKey` so the
// storefront keeps translating them; owner-added items carry literal MN/EN
// labels. An item may be backed by a real Medusa product category
// (`category_id` + a /shop?category=<handle> href) — that is what makes a new
// menu item something products can actually be put into.

export type NavItem = {
  id: string;
  label: Bi;
  href: string;
  /** Set on the four built-ins so the storefront can translate them. */
  i18nKey?: string;
  /** Set when this item is backed by a Medusa product category. */
  category_id?: string;
  enabled: boolean;
};

const KEY = "cms_nav";

// The four audience categories the store shipped with. Returned when the owner
// has never saved a menu, so the storefront looks exactly as it does today.
export function defaultNav(): NavItem[] {
  return [
    { id: "men", label: { mn: "Эрэгтэй", en: "Men" }, href: "/shop?gender=men", i18nKey: "nav.men", enabled: true },
    { id: "women", label: { mn: "Эмэгтэй", en: "Women" }, href: "/shop?gender=women", i18nKey: "nav.women", enabled: true },
    { id: "new", label: { mn: "Шинэ ирсэн", en: "New arrivals" }, href: "/shop?sort=new", i18nKey: "nav.new", enabled: true },
    { id: "gift", label: { mn: "Бэлгийн багц", en: "Gift sets" }, href: "/shop?gender=gift", i18nKey: "gender.gift", enabled: true },
  ];
}

export async function readNav(scope: { resolve: (k: any) => any }): Promise<NavItem[]> {
  const storeModule = scope.resolve(Modules.STORE);
  const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
  const saved = (store?.metadata as any)?.[KEY];
  if (!Array.isArray(saved) || saved.length === 0) return defaultNav();
  return sanitizeNav(saved);
}

export async function writeNav(scope: { resolve: (k: any) => any }, items: NavItem[]): Promise<NavItem[]> {
  const clean = sanitizeNav(items);
  await setStoreMeta(scope, KEY, clean);
  return clean;
}

// Links are owner-supplied, so they are restricted to in-site paths and https
// URLs — a javascript: href here would run for every shopper who opens the menu.
const safeHref = (v: any): string => {
  const h = String(v ?? "").trim();
  return /^\/(?!\/)/.test(h) || /^https:\/\//i.test(h) ? h.slice(0, 500) : "/shop";
};

export function sanitizeNav(input: any): NavItem[] {
  if (!Array.isArray(input)) return defaultNav();
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const raw of input.slice(0, 12)) {
    const mn = String(raw?.label?.mn ?? "").trim().slice(0, 60);
    const en = String(raw?.label?.en ?? "").trim().slice(0, 60);
    // An item with no label at all would render as an invisible gap.
    if (!mn && !en && !raw?.i18nKey) continue;
    let id = String(raw?.id ?? "").trim().slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `item${items.length + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const i18nKey = String(raw?.i18nKey ?? "").trim().slice(0, 60);
    const categoryId = String(raw?.category_id ?? "").trim().slice(0, 80);
    items.push({
      id,
      label: { mn, en },
      href: safeHref(raw?.href),
      ...(i18nKey ? { i18nKey } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      enabled: raw?.enabled !== false,
    });
  }
  return items.length ? items : defaultNav();
}

// Cyrillic → Latin so an owner typing "Бусад" gets the handle "busad" rather
// than a percent-escaped mess in the storefront URL.
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", ө: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ү: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(name: string): string {
  const base = Array.from(String(name).toLowerCase())
    .map((ch) => (CYR[ch] !== undefined ? CYR[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || `cat-${Date.now().toString(36)}`;
}
