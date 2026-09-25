"use client";
import { Logo } from "./Logo";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SearchIcon, BagIcon, UserIcon, HeartIcon } from "./Icons";
import { useAuth, useCart, useWish, useUI } from "@/lib/store";
import { useT, useLang } from "./LangProvider";
import { LangToggle } from "./LangToggle";
import { SearchBox } from "./SearchBox";

// Small circular icon button that carries an animated count badge (shared by the
// wishlist + cart controls).
function CountBadge({ count }: { count: number }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 14 }}
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold grid place-items-center border-2 border-white num-tabular"
        >{count}</motion.span>
      )}
    </AnimatePresence>
  );
}

export function Nav() {
  const pathname = usePathname();
  // Paths are locale-prefixed (/mn/shop); nav hrefs are not.
  const localPath = pathname.replace(/^\/(mn|en)(?=\/|$)/, "") || "/";
  const router = useRouter();
  const items = useCart(s => s.items);
  const wishIds = useWish(s => s.ids);
  const user = useAuth(s => s.user);
  const openCart = useUI(s => s.openCart);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const count = mounted ? items.reduce((a, b) => a + b.qty, 0) : 0;
  const wishCount = mounted ? wishIds.length : 0;
  const t = useT();
  const lang = useLang();


  // Keyboard: Cmd/Ctrl+K or "/" focuses the visible search input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const cmdK = k === "k" && (e.metaKey || e.ctrlKey);
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (cmdK || (e.key === "/" && !typing)) {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-search-input]"));
        const visible = inputs.find(i => i.offsetParent !== null) ?? inputs[0];
        if (visible) { e.preventDefault(); visible.focus(); visible.select(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const iconBtn = "relative w-11 h-11 rounded-full bg-white/70 border border-white/60 shadow-soft grid place-items-center text-ink hover:bg-white hover:-translate-y-px active:scale-90 transition-all duration-200 ease-elegant";

  const Wish = (
    <Link href="/wishlist" aria-label={t("nav.wishlist")} className={iconBtn}>
      <HeartIcon width={18} height={18} filled={wishCount > 0}/>
      <CountBadge count={wishCount}/>
    </Link>
  );
  const Bag = (
    <button onClick={openCart} data-cart-anchor className={iconBtn} aria-label={t("nav.cart")}>
      <BagIcon width={18} height={18}/>
      <CountBadge count={count}/>
    </button>
  );

  return (
    // Sticky: stays pinned while scrolling; firms up (more opaque, deeper shadow) once the page moves.
    <header className={`sticky top-2 sm:top-3 lg:top-4 z-50 transition-all duration-300 ease-elegant before:content-[""] before:absolute before:-inset-x-3 before:-top-2 before:-bottom-2 before:-z-10 before:bg-white/85 before:backdrop-blur-xl before:shadow-[0_8px_24px_-18px_rgba(10,10,11,.35)] before:opacity-0 before:transition-opacity before:duration-300 lg:before:hidden ${scrolled ? "max-lg:before:opacity-100 [&_nav]:bg-white/90 [&_nav]:shadow-[0_14px_40px_-18px_rgba(10,10,11,.32)]" : ""}`}>
      {/* ---------- Mobile bar ---------- */}
      <div className="lg:hidden">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="NARAN" className="shrink-0 -ml-0.5 mr-auto"><Logo priority className="h-10"/></Link>
          <LangToggle/>
          {Wish}
          {Bag}
        </div>
        {/* Search on its own full-width row, separate from the shop filters. */}
        <SearchBox className="mt-2.5" />
      </div>

      {/* ---------- Desktop bar — floating glass pill ----------
          3-column grid (logo · links · controls). The logo never shrinks; links
          that do not fit drop out whole, and the search and account name scale
          down between lg and xl so nothing collides at tighter widths (e.g. the
          narrower checkout container). */}
      <nav className="hidden lg:grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 xl:gap-8 bg-white/65 backdrop-blur-xl rounded-pill pl-4 xl:pl-5 pr-2 py-2 border border-white/60 ring-1 ring-black/[.04] shadow-[0_10px_34px_-16px_rgba(10,10,11,.28)]">
        <Link href="/" aria-label="NARAN" className="shrink-0 flex items-center transition-transform duration-300 ease-spring hover:scale-[1.04]">
          <Logo priority className="h-12 xl:h-[52px] -my-1 max-w-none shrink-0"/>
        </Link>

        {/* Links wrap onto a clipped second line when space runs out, so a link
            either shows whole or not at all — never squeezes the logo. */}
        <div className="flex flex-wrap items-start gap-x-5 xl:gap-x-6 gap-y-8 h-7 pt-1 overflow-hidden min-w-0">
          {[["/shop?gender=men","nav.men",true],["/shop?gender=women","nav.women",true],["/shop?sort=new","nav.new",false],["/shop?gender=gift","gender.gift",false]].map(([h,k,pri]) => (
            <Link key={k as string} href={h as string}
              aria-current={localPath === h ? "page" : undefined}
              className={`relative whitespace-nowrap text-[12px] uppercase tracking-[.12em] font-medium transition-colors after:absolute after:left-0 after:-bottom-1.5 after:h-[1.5px] after:bg-accent after:transition-all after:duration-300 after:ease-elegant hover:after:w-full ${pri ? "inline-flex" : "hidden xl:inline-flex"} ${localPath===h?"text-ink after:w-full":"text-muted hover:text-ink after:w-0"}`}>{t(k as string)}</Link>
          ))}
        </div>

        <div className="flex items-center gap-2 xl:gap-2.5 justify-self-end">
          <SearchBox className="w-[200px] xl:w-[260px]" dropdownClassName="right-0 w-[400px]" />
          <LangToggle/>
          {Wish}
          {Bag}
          <Link href={mounted && user ? "/account" : "/auth"} aria-label={t("nav.account")} className="group flex items-center gap-2.5 bg-accent-deep text-white rounded-pill pl-1.5 xl:pl-4 pr-1.5 py-1.5 text-[12px] font-semibold uppercase tracking-[.1em] hover:-translate-y-px hover:shadow-lift active:scale-[.98] transition-all duration-200 ease-elegant">
            <span className="hidden xl:inline">{mounted && user ? user.firstName : t("nav.signin")}</span>
            <span className="w-8 h-8 rounded-full bg-white/15 grid place-items-center transition-colors group-hover:bg-accent"><UserIcon width={15} height={15}/></span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
