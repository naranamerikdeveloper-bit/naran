"use client";
import { createContext, useContext } from "react";
import { useLang, useT } from "./LangProvider";
import { DEFAULT_MENU, type MenuEntry } from "@/lib/nav-menu";

// Carries the owner-editable storefront menu from the layout (which fetches it)
// down to Nav and Footer, so both always show the same categories without
// either of them making its own request.
//
// The shape, defaults and CMS mapping live in lib/nav-menu — a server component
// cannot call a function exported from a "use client" file.
const Ctx = createContext<MenuEntry[]>(DEFAULT_MENU);

export function NavMenuProvider({ menu, children }: { menu: MenuEntry[]; children: React.ReactNode }) {
  return <Ctx.Provider value={menu}>{children}</Ctx.Provider>;
}

export function useNavMenu(): MenuEntry[] {
  return useContext(Ctx);
}

// Built-ins go through i18n; owner-added items use their own MN/EN label, with
// the other language as a fallback so a half-filled entry still reads.
export function useMenuLabel() {
  const t = useT();
  const lang = useLang();
  return (m: MenuEntry): string =>
    m.key ? t(m.key) : (lang === "en" ? m.label?.en || m.label?.mn : m.label?.mn || m.label?.en) || "";
}
