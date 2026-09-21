"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SearchIcon, BagIcon, UserIcon, HeartIcon } from "./Icons";
import { useAuth, useCart, useWish, useUI } from "@/lib/store";
import { useT, useLang } from "./LangProvider";
import { LangToggle } from "./LangToggle";

function Sliders({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>
    </svg>
  );
}

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
  const router = useRouter();
  const items = useCart(s => s.items);
  const wishIds = useWish(s => s.ids);
  const user = useAuth(s => s.user);
  const openCart = useUI(s => s.openCart);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? items.reduce((a, b) => a + b.qty, 0) : 0;
  const wishCount = mounted ? wishIds.length : 0;
  const t = useT();
  const lang = useLang();

  const [q, setQ] = useState("");
  useEffect(() => { setQ(new URLSearchParams(window.location.search).get("q") ?? ""); }, [pathname]);

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
  function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/${lang}/shop?q=${encodeURIComponent(term)}` : `/${lang}/shop`);
  }

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
    <>
      {/* ---------- Mobile bar ---------- */}
      <div className="lg:hidden flex items-center gap-2.5">
        <form onSubmit={search} className="flex-1 min-w-0 h-11 bg-white/70 border border-white/60 shadow-soft rounded-pill flex items-center gap-2.5 px-4 backdrop-blur focus-within:bg-white transition">
          <button type="submit" className="text-subtle hover:text-ink shrink-0 active:scale-90 transition" aria-label={t("nav.search")}><SearchIcon width={16} height={16}/></button>
          <input value={q} onChange={e => setQ(e.target.value)} aria-label={t("nav.search")} data-search-input
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-subtle min-w-0" placeholder={t("nav.searchShort")}/>
          <Link href="/shop" className="text-subtle hover:text-ink shrink-0" aria-label={t("shop.filters")}><Sliders size={17}/></Link>
        </form>
        <LangToggle/>
        {Wish}
        {Bag}
      </div>

      {/* ---------- Desktop bar — floating glass pill ----------
          3-column grid (links · centered logo · controls) so the centered logo
          always has reserved space and can never be overlapped by the side
          content. Secondary links, search width and the account name scale down
          between lg and xl so nothing ever collides at tighter widths. */}
      <nav className="hidden lg:grid grid-cols-[auto_1fr_auto] items-center gap-3 xl:gap-4 bg-white/65 backdrop-blur-xl rounded-pill pl-5 xl:pl-6 pr-2 py-2.5 border border-white/60 ring-1 ring-black/[.04] shadow-[0_10px_34px_-16px_rgba(10,10,11,.28)]">
        <div className="flex items-center gap-5 xl:gap-6 min-w-0">
          {[["/shop","nav.shop",true],["/shop?category=Fragrance","cat.Fragrance",false],["/shop?type=EDP","nav.edp",false],["/shop?type=EDT","nav.edt",false]].map(([h,k,pri]) => (
            <Link key={k as string} href={h as string}
              aria-current={pathname === h ? "page" : undefined}
              className={`relative whitespace-nowrap text-[12px] uppercase tracking-[.12em] font-medium transition-colors after:absolute after:left-0 after:-bottom-1.5 after:h-[1.5px] after:bg-accent after:transition-all after:duration-300 after:ease-elegant hover:after:w-full ${pri ? "inline-flex" : "hidden xl:inline-flex"} ${pathname===h?"text-ink after:w-full":"text-muted hover:text-ink after:w-0"}`}>{t(k as string)}</Link>
          ))}
        </div>

        <Link href="/" className="group justify-self-center flex items-center gap-2 font-display text-[20px] xl:text-[22px] tracking-[.04em] leading-none whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-accent transition-transform duration-300 ease-spring group-hover:scale-125"/>
          NARAN
        </Link>

        <div className="flex items-center gap-2 xl:gap-2.5 justify-self-end">
          <form onSubmit={search} className="flex items-center gap-2.5 bg-surface-2 rounded-pill px-4 py-2.5 border border-transparent focus-within:border-line focus-within:bg-white transition-all duration-300 w-[150px] xl:w-[200px] focus-within:w-[210px] xl:focus-within:w-[260px]">
            <button type="submit" className="text-subtle hover:text-ink shrink-0 active:scale-90 transition" aria-label={t("nav.search")}><SearchIcon width={16} height={16}/></button>
            <input value={q} onChange={e => setQ(e.target.value)} aria-label={t("nav.search")} data-search-input
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-subtle min-w-0" placeholder={t("nav.searchShort")}/>
          </form>
          <LangToggle/>
          {Wish}
          {Bag}
          <Link href={user ? "/account" : "/auth"} aria-label={t("nav.account")} className="group flex items-center gap-2.5 bg-ink text-white rounded-pill pl-1.5 xl:pl-4 pr-1.5 py-1.5 text-[12px] font-semibold uppercase tracking-[.1em] hover:-translate-y-px hover:shadow-lift active:scale-[.98] transition-all duration-200 ease-elegant">
            <span className="hidden xl:inline">{user ? user.firstName : t("nav.signin")}</span>
            <span className="w-8 h-8 rounded-full bg-white/15 grid place-items-center transition-colors group-hover:bg-accent"><UserIcon width={15} height={15}/></span>
          </Link>
        </div>
      </nav>
    </>
  );
}
