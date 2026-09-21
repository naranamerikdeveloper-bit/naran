"use client";
import { Logo } from "@/components/Logo";
import { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart, useOrders } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { wire } from "@/lib/wire";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

function Processing() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const pi = params.get("pi");
  const items = useCart(s => s.items);
  const clear = useCart(s => s.clear);
  const addOrder = useOrders(s => s.addOrder);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const done = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!pi) { setError(t("proc.missingRef")); return; }
    let tries = 0;
    const tick = async () => {
      if (done.current) return;
      try {
        const { status, order } = await wire.status(pi);
        if (status === "succeeded" && order) {
          done.current = true;
          addOrder({
            id: order.id,
            email: order.email,
            total: order.total,
            items: itemsRef.current.map(i => ({ name: i.name + (i.size ? ` · ${i.size}` : ""), qty: i.qty, price: i.price })),
            status: "processing",
            createdAt: new Date().toISOString(),
            estimatedDelivery: order.estimatedDelivery,
          });
          clear();
          router.replace(`/${lang}/checkout/success?id=${encodeURIComponent(order.id)}&total=${order.total}`);
          return;
        }
        if (status === "review") {
          // Payment captured but order not finalized — the team will reconcile.
          // Clear the cart so the customer can't be charged again for it.
          done.current = true;
          clear();
          setReview(true);
          return;
        }
      } catch (e: any) {
        if (++tries > 3) { setError(e.message || t("proc.verifyFailed")); return; }
      }
      if (++tries > 40) { setError(t("proc.timeout")); return; }
      setTimeout(tick, 1500);
    };
    tick();
  }, [pi, addOrder, clear, router]);

  const state = review ? "review" : error ? "error" : "loading";

  return (
    <div className="min-h-screen grid place-items-center p-6 mesh-light">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="bg-white rounded-3xl p-10 max-w-[460px] w-full border border-line shadow-lift text-center"
      >
        <Logo className="h-10 mx-auto"/>
        <AnimatePresence mode="wait" initial={false}>
          {state === "review" ? (
            <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              <motion.div className="my-8 mx-auto w-[72px] h-[72px] rounded-full bg-accent-soft grid place-items-center text-accent-deep"
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
                <svg width="34" height="34" viewBox="0 0 52 52" fill="none"><path d="M14 27 l8 8 l16 -18" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </motion.div>
              <h1 className="font-display text-[24px] uppercase tracking-tight">{t("proc.reviewTitle")}</h1>
              <p className="text-muted mt-3">{t("proc.reviewDesc")}</p>
              <button onClick={() => router.push(`/${lang}/account`)} className="btn btn-primary mt-6">{t("proc.reviewCta")}</button>
            </motion.div>
          ) : state === "loading" ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              {/* dual-ring loader: soft track + accent arc spinning */}
              <div className="my-8 mx-auto relative w-[72px] h-[72px]">
                <div className="absolute inset-0 rounded-full border-4 border-surface-3"/>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent border-r-accent animate-spin"/>
                <span className="absolute inset-0 grid place-items-center"><span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse"/></span>
              </div>
              <h1 className="font-display text-[26px] uppercase tracking-tight">{t("proc.title")}</h1>
              <p className="text-muted mt-3">{t("proc.desc")}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-[12px] text-muted bg-surface-2 px-3 py-1.5 rounded-pill">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"/> {t("proc.waiting")}
              </div>
            </motion.div>
          ) : (
            <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              <motion.div className="my-8 mx-auto w-[72px] h-[72px] rounded-full bg-surface-2 grid place-items-center text-2xl text-ink/60"
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>!</motion.div>
              <h1 className="font-display text-[24px] uppercase tracking-tight">{t("proc.pendingTitle")}</h1>
              <p className="text-muted mt-3">{error}</p>
              <button onClick={() => router.push(`/${lang}/cart`)} className="btn btn-primary mt-6">{t("proc.backToCart")}</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function ProcessingPage() {
  return <Suspense fallback={null}><Processing /></Suspense>;
}
