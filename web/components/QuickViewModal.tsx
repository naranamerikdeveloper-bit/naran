"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuickView, useCart, useToast, useUI, flyToCart } from "@/lib/store";
import { useT } from "./LangProvider";
import { money } from "@/lib/api";
import { Photo } from "./Photo";
import { ProductVisual } from "./ProductVisual";
import { productImg } from "@/lib/images";
import { ArrowUpRight } from "./Icons";
import { useFocusTrap } from "@/lib/useFocusTrap";

export function QuickViewModal() {
  const product = useQuickView(s => s.product);
  const close = useQuickView(s => s.close);
  const add = useCart(s => s.add);
  const showToast = useToast(s => s.show);
  const openCart = useUI(s => s.openCart);
  const t = useT();

  const open = !!product;
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Reset the selection whenever a new product is opened.
  useEffect(() => {
    if (!product) return;
    setQty(1);
    setSize(product.sizes.length > 1 ? "" : product.sizes[0]);
  }, [product]);

  // Esc closes; lock scroll; manage focus.
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement;
    const id = setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(id);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      lastFocused.current?.focus?.();
    };
  }, [open, close]);

  const sizable = !!product && product.sizes.length > 1;
  const sizeStock = (s: string) => product?.variants?.find(v => v.size === s)?.stock ?? 9999;
  const priceOf = (s: string) => product?.variants?.find(v => v.size === s)?.price ?? product?.price ?? 0;
  const hasRange = !!product && new Set((product.variants ?? []).map(v => v.price).filter(n => n != null)).size > 1;
  const soldOut = !!product && (product.variants?.length ?? 0) > 0 && product.variants!.every(v => v.stock === 0);

  function handleAdd(src?: HTMLElement | null) {
    if (!product) return;
    if (soldOut) { showToast(t("common.soldOut")); return; }
    if (sizable && !size) { showToast(t("toast.selectSize")); return; }
    if (size && sizeStock(size) === 0) { showToast(t("toast.sizeSoldOut")); return; }
    const variantId = product.variants?.find(v => v.size === size)?.id ?? product.variants?.[0]?.id;
    add(product, qty, { size, variantId });
    flyToCart(src, product.accent);
    close();
    openCart();
  }

  const img = product ? (product.image ?? productImg(product.id)) : "";

  return (
    <AnimatePresence>
      {product && (
        <div className="fixed inset-0 z-[85] grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <motion.div
            ref={dialogRef}
            data-lenis-prevent
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            role="dialog" aria-modal="true" aria-label={product.name}
            className="relative w-[min(820px,96vw)] max-h-[92vh] overflow-y-auto overflow-x-hidden bg-white rounded-3xl shadow-deep grid grid-cols-1 sm:grid-cols-2"
          >
            <button ref={closeRef} onClick={close} aria-label={t("common.close")}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full grid place-items-center bg-white/85 backdrop-blur hover:bg-white shadow-soft text-xl leading-none">×</button>

            {/* Image */}
            <div className="relative bg-graphite aspect-[4/5] sm:aspect-auto sm:min-h-[420px]">
              <Photo src={img} alt={product.name}
                fallback={<div className="absolute inset-0 grid place-items-center card-dark"><ProductVisual product={product} size="lg"/></div>}
                imgClassName="absolute inset-0 w-full h-full object-cover"/>
              {product.badge && (
                <span className={`absolute top-4 left-4 text-[11px] uppercase tracking-[.14em] font-semibold px-3 h-7 rounded-pill grid place-items-center ${product.badge === "New" ? "bg-accent text-white" : "bg-white text-ink"}`}>{product.badge}</span>
              )}
            </div>

            {/* Details */}
            <div className="p-6 sm:p-7">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-surface-2 text-[12px] font-medium uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: product.accent }}/> {product.category}
              </span>
              <h2 className="font-display text-[26px] sm:text-[30px] uppercase tracking-[-.02em] leading-[.98] mt-3">{product.name}</h2>

              {product.reviews > 0 && (
                <div className="flex items-center gap-2 text-[13px] text-muted mt-2" role="img" aria-label={`${t("common.rating")}: ${product.rating} / 5`}>
                  <span className="text-[#F4B400]" aria-hidden>★★★★★</span>
                  <span className="num-tabular">{product.rating}</span>
                </div>
              )}

              <div className="flex items-baseline gap-3 mt-4">
                {hasRange && !size && <span className="text-[13px] text-muted">{t("common.from")}</span>}
                <span className="font-display text-[26px] text-accent-deep">{money(size ? priceOf(size) : product.price)}</span>
                {product.was && <span className="text-subtle line-through num-tabular">{money(product.was)}</span>}
              </div>

              <p className="text-muted text-[14px] leading-relaxed mt-4 line-clamp-3">{product.description}</p>

              {/* Size */}
              {sizable && (
                <div className="mt-4">
                  <div className="text-[13px] font-semibold mb-2">{t("common.size")}</div>
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map(s => {
                      const out = sizeStock(s) === 0;
                      return (
                        <button key={s} disabled={out} onClick={() => !out && setSize(s)}
                          className={`min-w-[48px] px-3.5 py-2 rounded-pill border text-sm transition ${
                            out ? "border-line bg-surface-2 text-subtle line-through cursor-not-allowed"
                            : size === s ? "bg-ink text-white border-ink" : "border-line bg-white hover:border-ink"
                          }`}>
                          {s}
                          {hasRange && <span className="ml-1.5 opacity-70 num-tabular">{money(priceOf(s))}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions — stacked full-width so long labels never overflow */}
              <div className="flex flex-col gap-2.5 mt-6">
                <button disabled={soldOut} onClick={(e) => handleAdd(e.currentTarget)}
                  className="btn btn-dark w-full justify-center disabled:opacity-50">
                  {soldOut ? t("common.soldOut") : t("common.addToBag")}
                </button>
                <Link href={`/product/${product.slug}`} onClick={close}
                  className="btn btn-outline w-full justify-center">
                  {t("common.viewDetails")}
                  <span className="arrow-cap !bg-ink !text-white"><ArrowUpRight width={14} height={14}/></span>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
