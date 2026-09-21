"use client";
import { Logo } from "@/components/Logo";
import { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart, useOrders } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { money } from "@/lib/api";
import { botxon, type BotxonBankUrl } from "@/lib/botxon";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

type InvoiceView = {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  shortUrl: string;
  urls: BotxonBankUrl[];
  amount?: number;
};

// Botxon may return the QR as a full data URI/URL or a bare base64 PNG.
function qrSrc(qrImage: string): string {
  if (!qrImage) return "";
  return /^(https?:|data:)/.test(qrImage) ? qrImage : `data:image/png;base64,${qrImage}`;
}

function Pay() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const inv = params.get("inv");

  const clear = useCart(s => s.clear);
  const addOrder = useOrders(s => s.addOrder);
  const items = useCart(s => s.items);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const done = useRef(false);

  // Load the QR/deeplinks the checkout page stashed (instant render, offline-safe).
  // Depend only on `inv` — `t` from useT() is a fresh function each render, so
  // including it here would re-run every render and loop (max update depth).
  useEffect(() => {
    if (!inv) { setError(t("pay.missing")); return; }
    try {
      const raw = sessionStorage.getItem(`botxon_inv_${inv}`);
      if (raw) setInvoice(JSON.parse(raw));
    } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv]);

  // Poll payment status; the server settles the order via webhook or this poll.
  useEffect(() => {
    if (!inv) return;
    let tries = 0;
    const tick = async () => {
      if (done.current) return;
      try {
        const { status, order, invoice: fromServer } = await botxon.status(inv);
        // Backfill the QR from the server if sessionStorage was empty (e.g. refresh).
        if (fromServer && !invoice) setInvoice(prev => prev ?? { ...fromServer });
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
          done.current = true;
          clear();
          setReview(true);
          return;
        }
        if (status === "failed") {
          // Payment failed at the gateway — keep the cart so they can retry.
          done.current = true;
          setError(t("pay.failed"));
          return;
        }
      } catch (e: any) {
        if (++tries > 3) { setError(e.message || t("proc.verifyFailed")); return; }
      }
      if (++tries > 120) { setError(t("proc.timeout")); return; } // ~4 min
      setTimeout(tick, 2000);
    };
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv]);

  if (review) {
    return (
      <Shell>
        <motion.div className="my-8 mx-auto w-[72px] h-[72px] rounded-full bg-accent-soft grid place-items-center text-accent-deep"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
          <svg width="34" height="34" viewBox="0 0 52 52" fill="none"><path d="M14 27 l8 8 l16 -18" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </motion.div>
        <h1 className="font-display text-[24px] uppercase tracking-tight">{t("proc.reviewTitle")}</h1>
        <p className="text-muted mt-3">{t("proc.reviewDesc")}</p>
        <button onClick={() => router.push(`/${lang}/account`)} className="btn btn-primary mt-6">{t("proc.reviewCta")}</button>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <motion.div className="my-8 mx-auto w-[72px] h-[72px] rounded-full bg-surface-2 grid place-items-center text-2xl text-ink/60"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>!</motion.div>
        <h1 className="font-display text-[24px] uppercase tracking-tight">{t("proc.pendingTitle")}</h1>
        <p className="text-muted mt-3">{error}</p>
        <button onClick={() => router.push(`/${lang}/cart`)} className="btn btn-primary mt-6">{t("proc.backToCart")}</button>
      </Shell>
    );
  }

  const src = invoice ? qrSrc(invoice.qrImage) : "";

  return (
    <Shell wide>
      <h1 className="font-display text-[24px] sm:text-[26px] uppercase tracking-tight mt-1">{t("pay.title")}</h1>
      <p className="text-muted mt-2 text-[14px]">{t("pay.subtitle")}</p>
      {invoice?.amount != null && (
        <div className="mt-4 inline-flex items-baseline gap-2 rounded-pill bg-surface-2 px-4 py-2">
          <span className="text-[12px] text-muted">{t("pay.amount")}</span>
          <span className="font-display text-[20px] num-tabular">{money(invoice.amount)}</span>
        </div>
      )}

      {/* QR — scan with a bank app on another device */}
      <div className="mt-6 mx-auto w-[224px] max-w-full">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-soft grid place-items-center aspect-square">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="QPay QR" width={192} height={192} className="w-full h-full object-contain rounded-lg" />
          ) : (
            <div className="text-center px-3">
              <div className="w-full aspect-square rounded-lg bg-surface-2 grid place-items-center mb-2">
                <span className="w-9 h-9 rounded-full border-3 border-accent/30 border-t-accent animate-spin" style={{ borderWidth: 3 }} />
              </div>
              <p className="tiny text-muted">{t("pay.mockNote")}</p>
            </div>
          )}
        </div>
        <p className="tiny text-muted mt-2.5">{t("pay.scanHint")}</p>
      </div>

      {/* Bank deeplinks — tap on a phone to open the bank app directly */}
      {invoice?.urls?.length ? (
        <div className="mt-6 text-left">
          <p className="text-[12px] font-medium text-muted mb-2.5">{t("pay.appHint")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {invoice.urls.map((u, i) => (
              <a key={u.link + i} href={u.link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 hover:border-ink/40 hover:-translate-y-px transition-all duration-200 ease-elegant">
                {u.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.logo} alt="" width={22} height={22} className="w-[22px] h-[22px] rounded object-contain shrink-0" />
                ) : (
                  <span className="w-[22px] h-[22px] rounded bg-surface-2 shrink-0" aria-hidden />
                )}
                <span className="text-[12px] font-medium truncate">{u.name || u.description || t("pay.openApp")}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {invoice?.shortUrl ? (
        <a href={invoice.shortUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-5 text-[13px] text-accent-deep underline underline-offset-2">
          {t("pay.shortUrl")}
        </a>
      ) : null}

      <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-muted bg-surface-2 px-3 py-1.5 rounded-pill">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> {t("pay.waiting")}
      </div>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen grid place-items-center p-6 mesh-light">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className={`bg-white rounded-3xl p-8 sm:p-10 w-full border border-line shadow-lift text-center ${wide ? "max-w-[520px]" : "max-w-[460px]"}`}
      >
        <Logo className="h-10 mx-auto"/>
        {children}
      </motion.div>
    </div>
  );
}

export default function PayPage() {
  return <Suspense fallback={null}><Pay /></Suspense>;
}
