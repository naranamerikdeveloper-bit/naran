"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { ProductGridSkeleton } from "@/components/ProductCardSkeleton";
import { HeartIcon, ArrowRight } from "@/components/Icons";
import { useWish } from "@/lib/store";
import { useT } from "@/components/LangProvider";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";

export default function WishlistPage() {
  const t = useT();
  const ids = useWish(s => s.ids);
  const clearWish = useWish(s => s.clear);
  const [all, setAll] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    api.products.list({}).then(r => setAll(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const wished = all.filter(p => ids.includes(p.id));
  const busy = !mounted || loading;

  return (
    <>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1280px] mx-auto">
          <Nav />

          <div className="text-[11px] font-mono tracking-wider text-subtle flex items-center gap-2 mt-6">
            <Link href="/" className="hover:text-ink uppercase">{t("bc.home")}</Link>
            <span className="opacity-40">/</span>
            <span className="text-ink uppercase">{t("nav.wishlist")}</span>
          </div>

          <div className="mt-3 mb-6 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-[30px] sm:text-[44px] uppercase tracking-tight leading-[.95]">{t("wish.title")}</h1>
              {mounted && !busy && wished.length > 0 && (
                <p className="text-muted text-[13px] mt-2 num-tabular">{wished.length} {t("wish.items")}</p>
              )}
            </div>
            {mounted && !busy && wished.length > 0 && (
              <button onClick={clearWish} className="btn btn-ghost btn-sm">{t("wish.clear")}</button>
            )}
          </div>

          {busy ? (
            <ProductGridSkeleton count={4} />
          ) : wished.length === 0 ? (
            <div className="mt-6 bg-white border border-line rounded-2xl p-12 sm:p-16 text-center">
              <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent">
                <HeartIcon width={26} height={26} />
              </span>
              <h3 className="font-display text-[22px]">{t("wish.emptyTitle")}</h3>
              <p className="text-muted mt-2 text-sm max-w-[320px] mx-auto">{t("wish.emptyDesc")}</p>
              <Link href="/shop" className="btn btn-outline mt-6 inline-flex">
                {t("wish.browse")} <span className="arrow-cap !bg-white !text-ink"><ArrowRight width={14} height={14}/></span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {wished.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
