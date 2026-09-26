"use client";
import { Logo } from "./Logo";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SearchIcon, BagIcon, UserIcon, HeartIcon, ArrowUpRight } from "./Icons";
import { useAuth, useCart, useWish, useUI } from "@/lib/store";
import { useT, useLang } from "./LangProvider";
import { LangToggle } from "./LangToggle";
import { SearchBox } from "./SearchBox";
import { useFocusTrap } from "@/lib/useFocusTrap";

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

// The storefront's audience categories — shared by the desktop pill and the
// mobile drawer so both always show the same four entries.
const NAV_LINKS: [string, string][] = [
  ["/shop?gender=men", "nav.men"],
  ["/shop?gender=women", "nav.women"],
  ["/shop?sort=new", "nav.new"],
  ["/shop?gender=gift", "gender.gift"],
];

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

  // Mobile category drawer (slides in from the left). Closes on navigation and
  // locks background scroll while open.
  // Nav hrefs carry a query (/shop?gender=men), so comparing them to the bare
  // pathname never matched and nothing was ever highlighted. Read the query on
  // the client instead of useSearchParams, which would opt these pages out of
  // static rendering.
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(window.location.search); }, [pathname]);
  const isActive = (href: string) => {
    const [path, qs] = href.split("?");
    if (localPath !== path) return false;
    if (!qs) return !search || search === "?";
    const [k, v] = qs.split("=");
    return new URLSearchParams(search).get(k) === v;
  };

  const [menuOpen, setMenuOpen] = useState(false);
  // Keyboard/screen-reader users must not tab out of the open drawer into the
  // page behind it (the cart drawer already does this).
  const menuPanelRef = useRef<HTMLElement>(null);
  useFocusTrap(menuPanelRef, menuOpen);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);


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
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
            className="shrink-0 grid place-items-center w-10 h-10 rounded-full bg-white/70 border border-black/[.06] text-ink active:scale-95 transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <Link href="/" aria-label="NARAN" className="shrink-0 mr-auto"><Logo priority className="h-10"/></Link>
          <LangToggle/>
          {Wish}
          {Bag}
        </div>
        {/* Search on its own full-width row, separate from the shop filters. */}
        <SearchBox className="mt-2.5" />
      </div>

      {/* ---------- Mobile category drawer (slides from the left) ---------- */}
      <AnimatePresence>
        {menuOpen && (
          <div className="lg:hidden">
            <motion.div
              className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              ref={menuPanelRef}
              className="fixed inset-y-0 left-0 z-[70] flex w-[84%] max-w-[330px] flex-col bg-white shadow-2xl"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              role="dialog" aria-modal="true" aria-label={t("nav.menu")}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-line">
                <Link href="/" aria-label="NARAN" onClick={() => setMenuOpen(false)}><Logo className="h-9"/></Link>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label={t("common.close")}
                  className="grid place-items-center w-9 h-9 rounded-full bg-surface-2 text-ink active:scale-95 transition">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="px-3 py-4 overflow-y-auto">
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[.18em] text-subtle">{t("home.category")}</div>
                <nav className="flex flex-col">
                  {NAV_LINKS.map(([h, k]) => (
                    <Link key={k} href={h} onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium text-ink hover:bg-surface-2 transition-colors">
                      {t(k)}
                      <span className="text-subtle"><ArrowUpRight width={15} height={15}/></span>
                    </Link>
                  ))}
                  <Link href="/shop" onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium text-ink hover:bg-surface-2 transition-colors">
                    {t("nav.shop")}
                    <span className="text-subtle"><ArrowUpRight width={15} height={15}/></span>
                  </Link>
                </nav>
              </div>

              <div className="mt-auto border-t border-line px-5 py-4">
                <Link href={mounted && user ? "/account" : "/auth"} onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl bg-accent-deep text-white px-4 py-3 text-[14px] font-semibold uppercase tracking-[.08em] active:scale-[.99] transition">
                  <span className="w-8 h-8 rounded-full bg-white/15 grid place-items-center"><UserIcon width={15} height={15}/></span>
                  {mounted && user ? user.firstName : t("nav.signin")}
                </Link>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

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
        <div className="flex flex-wrap items-start gap-x-4 xl:gap-x-6 gap-y-8 h-7 pt-1 overflow-hidden min-w-0">
          {NAV_LINKS.map(([h, k]) => (
            <Link key={k} href={h}
              aria-current={isActive(h) ? "page" : undefined}
              className={`relative inline-flex whitespace-nowrap text-[12px] uppercase tracking-[.1em] xl:tracking-[.12em] font-medium transition-colors after:absolute after:left-0 after:-bottom-1.5 after:h-[1.5px] after:bg-accent after:transition-all after:duration-300 after:ease-elegant hover:after:w-full ${isActive(h)?"text-ink after:w-full":"text-muted hover:text-ink after:w-0"}`}>{t(k)}</Link>
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
