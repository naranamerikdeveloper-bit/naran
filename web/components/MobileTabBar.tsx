"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HomeIcon, SearchIcon, BagIcon, UserIcon } from "./Icons";
import { useT } from "./LangProvider";
import { useCart } from "@/lib/store";

/**
 * Mobile bottom navigation: a light frosted bar with icon + label per tab.
 * The active tab is picked out in coral with a soft chip behind the icon; the
 * bag shows its item count. Hidden on the PDP, which has its own sticky
 * add-to-bag bar in this slot.
 */
export function MobileTabBar() {
  const raw = usePathname();
  const t = useT();
  const items = useCart(s => s.items);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? items.reduce((a, b) => a + b.qty, 0) : 0;

  // Paths are locale-prefixed (/mn/shop) — compare without the prefix.
  const path = raw.replace(/^\/(mn|en)(?=\/|$)/, "") || "/";
  if (path.startsWith("/product/")) return null;

  const tabs = [
    { href: "/",        label: t("tab.home"), icon: HomeIcon },
    { href: "/shop",    label: t("tab.shop"), icon: SearchIcon },
    { href: "/cart",    label: t("tab.cart"), icon: BagIcon, badge: count },
    { href: "/account", label: t("tab.me"),   icon: UserIcon },
  ];

  return (
    <nav aria-label="Mobile"
      className="lg:hidden fixed inset-x-3 z-40 bottom-[max(12px,env(safe-area-inset-bottom))] rounded-[1.4rem] border border-white/70 bg-white/85 backdrop-blur-xl shadow-[0_16px_40px_-18px_rgba(10,10,11,.35),0_2px_8px_-4px_rgba(10,10,11,.12)] ring-1 ring-black/[.04]">
      <ul className="grid grid-cols-4 px-1.5 py-1.5">
        {tabs.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-label={label} aria-current={active ? "page" : undefined}
                className="group flex flex-col items-center justify-center gap-1 h-[54px] rounded-2xl active:scale-95 transition-transform">
                <span className={`relative grid place-items-center w-11 h-7 rounded-full transition-colors duration-300 ${
                  active ? "bg-accent-soft text-accent-deep" : "text-ink/55 group-hover:text-ink"}`}>
                  <Icon width={20} height={20} />
                  {!!badge && (
                    <span className="absolute -top-1 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-accent text-white text-[10px] font-bold leading-[17px] text-center ring-2 ring-white num-tabular">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className={`text-[10.5px] leading-none tracking-wide transition-colors ${
                  active ? "text-accent-deep font-semibold" : "text-ink/55 font-medium"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
