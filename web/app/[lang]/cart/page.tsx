"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductVisual } from "@/components/ProductVisual";
import { Photo } from "@/components/Photo";
import { ArrowRight, TrashIcon, CheckIcon } from "@/components/Icons";
import { useCart } from "@/lib/store";
import { useDelivery } from "@/lib/useDelivery";
import { useT } from "@/components/LangProvider";
import { Skeleton } from "@/components/Skeleton";
import { money } from "@/lib/api";
import { productImg } from "@/lib/images";

export default function CartPage() {
  const t = useT();
  const items = useCart(s => s.items);
  const setQty = useCart(s => s.setQty);
  const remove = useCart(s => s.remove);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const subtotal = items.reduce((a, b) => a + b.price * b.qty, 0);
  const tax = 0;
  // One delivery fee for every order, set in the admin (0 = free).
  const delivery = useDelivery();
  const shipping = delivery?.fee ?? 0;
  const total = subtotal + tax + shipping;

  return (
    <>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1280px] mx-auto">
          <Nav />

          <div className="mt-6">
            <div className="text-[11px] font-mono tracking-wider text-subtle flex items-center gap-2">
              <Link href="/" className="hover:text-ink uppercase">{t("bc.home")}</Link><span className="opacity-40">/</span><span className="text-ink uppercase">{t("bc.cart")}</span>
            </div>
            <h1 className="font-display text-[34px] sm:text-[48px] uppercase tracking-tight leading-[.95] mt-3">
              {t("cart.titlePre")} <span className="text-accent">{t("cart.titleAccent")}</span>
            </h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 mt-6 pb-10">
            <div className="bg-white border border-line rounded-2xl p-2 shadow-soft">
              {!mounted ? (
                <div className="p-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex gap-3 sm:gap-4 items-center p-3 sm:p-4 border-b border-line last:border-none">
                      <Skeleton className="w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] shrink-0"/>
                      <div className="flex-1 space-y-2.5">
                        <Skeleton className="h-4 w-1/2"/>
                        <Skeleton className="h-3 w-1/4"/>
                        <Skeleton className="h-8 w-32 rounded-pill"/>
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <h3 className="font-display text-[22px] mb-2">{t("cart.emptyTitle")}</h3>
                  <p className="text-muted">{t("cart.emptyDesc")}</p>
                  <Link href="/shop" className="btn btn-outline mt-5 inline-flex">
                    {t("common.browseShop")} <span className="arrow-cap !bg-white !text-ink"><ArrowRight width={14} height={14}/></span>
                  </Link>
                </div>
              ) : (
                items.map(it => (
                  <div key={it.variantId || it.id} className="flex gap-3 sm:gap-4 items-center p-3 sm:p-4 border-b border-line last:border-none">
                    <div className="relative w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] shrink-0 rounded-xl overflow-hidden bg-graphite">
                      <Photo src={it.image ?? productImg(it.id)} alt={it.name}
                        fallback={<div className="w-full h-full grid place-items-center card-dark"><ProductVisual product={{ shape: it.shape, accent: it.accent }} size="sm"/></div>}
                        imgClassName="w-full h-full object-cover"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] sm:text-[15px] truncate">{it.name}</div>
                      <div className="tiny">{it.category}{it.size ? ` · ${it.size}` : ""}</div>
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="inline-flex items-center bg-surface-2 rounded-pill p-1">
                          <button onClick={() => setQty(it.variantId || it.id, it.qty - 1)} disabled={it.qty <= 1} aria-label={t("common.decrease")} className="w-8 h-8 rounded-full grid place-items-center hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">−</button>
                          <span className="px-3 font-semibold text-sm min-w-[28px] text-center num-tabular">{it.qty}</span>
                          <button onClick={() => setQty(it.variantId || it.id, it.qty + 1)} disabled={it.qty >= (it.max ?? 99)} aria-label={t("common.increase")} className="w-8 h-8 rounded-full grid place-items-center hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">+</button>
                        </div>
                        <div className="font-display text-[16px] num-tabular">{money(it.price * it.qty)}</div>
                      </div>
                    </div>
                    <button onClick={() => remove(it.variantId || it.id)} className="w-9 h-9 rounded-full grid place-items-center text-muted hover:text-red-500 hover:bg-red-50 transition self-start" aria-label={t("common.remove")}><TrashIcon width={16} height={16}/></button>
                  </div>
                ))
              )}
            </div>

            <aside className="bg-white border border-line rounded-2xl p-6 h-fit lg:sticky lg:top-6 shadow-soft">
              <h3 className="font-display text-[20px] tracking-tight">{t("cart.summary")}</h3>
              <div className="mt-4">
                <Row k={t("cart.subtotal")} v={money(subtotal)}/>
                <Row k={t("cart.shipping")} v={!delivery ? "…" : shipping === 0 ? t("common.free") : money(shipping)}/>
              </div>
              <div className="flex justify-between border-t border-line mt-4 pt-4 font-display text-[20px]">
                <span>{t("cart.total")}</span><span className="num-tabular">{money(total)}</span>
              </div>
              <Link href="/checkout" className={`btn btn-primary w-full justify-center mt-4 ${items.length === 0 ? "pointer-events-none opacity-50" : ""}`}>
                {t("cart.checkout")} <span className="arrow-cap !bg-white !text-ink"><ArrowRight width={14} height={14}/></span>
              </Link>
              {mounted && delivery?.fee === 0 && (
                <div className="mt-4 p-3 rounded-xl bg-accent-soft/60 text-[12.5px] text-accent-deep text-center font-medium flex items-center justify-center gap-1.5">
                  <CheckIcon width={13} height={13}/> {t("cart.freeDelivery")}
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-2.5 text-muted"><span>{k}</span><span>{v}</span></div>;
}
