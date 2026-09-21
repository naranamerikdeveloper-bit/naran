"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { usePathname } from "next/navigation";
import { HomeIcon, SearchIcon, BagIcon, UserIcon } from "./Icons";
import { useT } from "./LangProvider";

export function MobileTabBar() {
  const path = usePathname();
  const t = useT();
  // The PDP shows its own sticky add-to-bag bar in this slot.
  if (path.startsWith("/product/")) return null;
  const items = [
    { href: "/",         label: t("tab.home"), icon: HomeIcon },
    { href: "/shop",     label: t("tab.shop"), icon: SearchIcon },
    { href: "/cart",     label: t("tab.cart"), icon: BagIcon },
    { href: "/account",  label: t("tab.me"),   icon: UserIcon },
  ];
  return (
    <nav className="lg:hidden fixed bottom-4 inset-x-4 z-40 bg-accent-deep text-white rounded-pill p-2 flex justify-around items-center shadow-deep">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== "/" && path.startsWith(href));
        return (
          <Link key={href} href={href} aria-label={label}
            className={`flex items-center justify-center gap-2 h-11 rounded-pill text-[12px] font-semibold transition-all ${
              active ? "bg-accent text-white px-5 flex-[1.4]" : "text-white/60 flex-1"
            }`}>
            <Icon width={19} height={19}/>
            {active && <span>{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
