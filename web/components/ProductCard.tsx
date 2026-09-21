"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { motion } from "framer-motion";
import { ProductVisual } from "./ProductVisual";
import { Photo } from "./Photo";
import { HeartIcon, BagIcon } from "./Icons";
import { useCart, useWish, useToast, useQuickView, flyToCart } from "@/lib/store";
import { productImg } from "@/lib/images";
import { money } from "@/lib/api";
import { useT } from "./LangProvider";
import type { Product } from "@/lib/types";
import { useEffect, useState } from "react";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const add = useCart(s => s.add);
  const openQuickView = useQuickView(s => s.open);
  const toggleWish = useWish(s => s.toggle);
  const has = useWish(s => s.has);
  const showToast = useToast(s => s.show);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wished = mounted && has(product.id);
  const soldOut = product.stock === 0;
  const t = useT();

  const fallback = (
    <div className="absolute inset-0 grid place-items-center"
         style={{ background: "linear-gradient(165deg,#2A2C2F 0%,#161719 60%,#0A0B0C 100%)" }}>
      <ProductVisual product={product} size="md"/>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      /* Cap the stagger so items deep in a large grid don't lag seconds behind. */
      transition={{ duration: 0.55, delay: Math.min(index, 8) * 0.045, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <Link href={`/product/${product.slug}`} className="group block">
        {/* Image — kept clean; controls overlay, product info sits below */}
        <div className="relative overflow-hidden rounded-[1.4rem] bg-graphite aspect-[4/5] transition-[transform,box-shadow] duration-500 ease-elegant group-hover:-translate-y-1 group-hover:shadow-deep">
          <Photo
            src={product.image ?? productImg(product.id)}
            alt={product.name}
            fallback={fallback}
            sizes="(max-width: 768px) 50vw, 25vw"
            imgClassName="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-elegant group-hover:scale-[1.06]"
          />
          <div className={`absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5 ${soldOut ? "backdrop-grayscale" : ""}`}/>

          {/* badge */}
          {soldOut ? (
            <span className="absolute top-3 left-3 z-10 text-[10px] uppercase tracking-[.14em] font-semibold px-2.5 h-6 rounded-pill grid place-items-center bg-ink text-white">{t("common.soldOut")}</span>
          ) : product.badge && (
            <span className={`absolute top-3 left-3 z-10 text-[10px] uppercase tracking-[.14em] font-semibold px-2.5 h-6 rounded-pill grid place-items-center ${
              product.badge === "New" ? "bg-accent text-white" : "bg-white/90 text-ink"
            }`}>{product.badge}</span>
          )}

          {/* wishlist */}
          <button
            onClick={(e) => { e.preventDefault(); toggleWish(product.id); }}
            className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full grid place-items-center backdrop-blur transition-all duration-200 ease-elegant active:scale-90 ${
              wished ? "text-red-500 bg-white scale-105" : "text-ink bg-white/85 hover:bg-white hover:scale-105"
            }`}
            aria-label={`${t("nav.wishlist")}: ${product.name}`}
            aria-pressed={wished}
          >
            <HeartIcon width={16} height={16} filled={wished}/>
          </button>

          {/* quick view — desktop hover (rises in with the hover) */}
          {!soldOut && (
            <button
              onClick={(e) => { e.preventDefault(); openQuickView(product); }}
              aria-label={`${t("common.quickView")}: ${product.name}`}
              className="hidden lg:flex absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-elegant"
            >
              <span className="bg-white/90 backdrop-blur text-ink text-[12px] font-semibold uppercase tracking-wide px-4 h-9 rounded-pill grid place-items-center shadow-soft hover:bg-white active:scale-95 transition-transform">
                {t("common.quickView")}
              </span>
            </button>
          )}

          {/* add to bag */}
          <button
            disabled={soldOut}
            onClick={(e) => { e.preventDefault(); if (soldOut) return; add(product); flyToCart(e.currentTarget, product.accent); showToast(`${product.name} · ${t("common.addToBag")}`); }}
            className={`absolute right-3 bottom-3 z-10 w-10 h-10 rounded-full grid place-items-center transition-all duration-200 ease-elegant ${
              soldOut ? "bg-white/40 text-ink/40 cursor-not-allowed" : "bg-ink text-white hover:bg-accent hover:scale-110 active:scale-95 shadow-soft"
            }`}
            aria-label={soldOut ? t("common.soldOut") : t("common.addToBag")}
          >
            <BagIcon width={16} height={16}/>
          </button>
        </div>

        {/* info — clean editorial row below the image */}
        <div className="flex items-start justify-between gap-2 mt-2.5 px-0.5">
          <div className="min-w-0">
            <div className="font-semibold text-[13px] sm:text-[14px] text-ink truncate leading-tight group-hover:text-accent-deep transition-colors">{product.name}</div>
            {/* The name already carries the brand; the type (Eau de Parfum…) says more than the category. */}
            <p className="tiny truncate mt-0.5">{product.fabric || t(`cat.${product.category}`)}</p>
          </div>
          <div className="text-right shrink-0">
            {new Set((product.variants ?? []).map(v => v.price).filter(n => n != null)).size > 1 && (
              <span className="tiny block leading-tight">{t("common.from")}</span>
            )}
            <span className="font-display text-[15px] sm:text-[16px] num-tabular block leading-tight">{money(product.price)}</span>
            {product.was && <span className="tiny line-through num-tabular">{money(product.was)}</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
