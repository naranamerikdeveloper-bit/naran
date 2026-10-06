import type { CmsNavItem } from "./medusa";

// Shape of one storefront menu entry (header pill, mobile drawer, footer).
//
// This lives outside components/NavMenuProvider on purpose: that file is
// "use client", so every export of it becomes a client reference and the server
// layout cannot CALL toMenu() there — only render its components.
//
// `key` is an i18n key, kept on the four built-ins so they stay translated;
// owner-added items come back from the CMS with literal mn/en labels instead.
export type MenuEntry = { href: string; key?: string; label?: { mn: string; en: string } };

// The categories the site shipped with — used until the owner saves a menu of
// their own in the admin (Контент → Сайтын цэс), and whenever the backend is
// unreachable.
export const DEFAULT_MENU: MenuEntry[] = [
  { href: "/shop?gender=men", key: "nav.men" },
  { href: "/shop?gender=women", key: "nav.women" },
  { href: "/shop?sort=new", key: "nav.new" },
  { href: "/shop?gender=gift", key: "gender.gift" },
];

// Shape the CMS payload into what Nav/Footer render. An entry with neither a
// translation key nor any label would show as a blank gap, so it is dropped.
export function toMenu(items: CmsNavItem[] | null | undefined): MenuEntry[] {
  if (!items || items.length === 0) return DEFAULT_MENU;
  const out = items
    .filter((i) => i && i.enabled !== false && (i.i18nKey || i.label?.mn || i.label?.en))
    .map((i) => ({ href: i.href || "/shop", key: i.i18nKey, label: i.label }));
  return out.length ? out : DEFAULT_MENU;
}
