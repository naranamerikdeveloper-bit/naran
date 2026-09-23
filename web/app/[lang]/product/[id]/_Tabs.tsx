"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useT } from "@/components/LangProvider";
import type { Product } from "@/lib/types";

export function Tabs({ product }: { product: Product }) {
  const t = useT();
  const [tab, setTab] = useState<"desc" | "spec" | "reviews" | "faq">("desc");
  const tabs = [["desc", "pdp.tabDesc"], ["spec", "pdp.tabSpec"], ["reviews", "pdp.tabReviews"], ["faq", "pdp.tabFaq"]] as const;

  return (
    <section className="mt-12 sm:mt-16">
      {/* Pill tab bar — clear spacing + an indicator that slides under the active
          tab. Scrolls horizontally on narrow screens. */}
      <div className="flex gap-1.5 p-1.5 rounded-pill bg-surface-2 border border-line overflow-x-auto no-scrollbar w-full sm:w-fit">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="relative h-11 px-5 sm:px-6 rounded-pill text-[13px] sm:text-sm font-medium whitespace-nowrap shrink-0 active:scale-95 transition-transform">
            {tab === k && (
              <motion.span layoutId="pdpTabPill" transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 bg-white rounded-pill shadow-soft" />
            )}
            <span className={`relative z-10 transition-colors ${tab === k ? "text-ink" : "text-muted hover:text-ink"}`}>{t(label)}</span>
          </button>
        ))}
      </div>

      {/* Content — `key={tab}` remounts on switch so the CSS entrance replays.
          CSS (not framer) keeps content from ever sticking invisible if a frame
          is throttled. */}
      <div key={tab} className="mt-7 rise-in">
        {tab === "desc" && (
          <div className="max-w-[760px] text-muted leading-[1.85] text-[15px] sm:text-base">
            <p>{product.description}</p>
            <ul className="mt-5 grid gap-2.5">
              {product.bullets.map((b, i) => (
                <li key={b} className="flex items-start gap-3 rise-in" style={{ animationDelay: `${40 + i * 55}ms` }}>
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "spec" && (
          <div className="max-w-[760px] rounded-2xl border border-line bg-white overflow-hidden shadow-soft">
            {Object.entries(product.specs).map(([k, v], i) => (
              <div key={k}
                className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-line last:border-none odd:bg-surface-2/40 hover:bg-accent-soft/30 transition-colors rise-in"
                style={{ animationDelay: `${40 + i * 55}ms` }}>
                <span className="text-muted text-[13.5px] sm:text-[14px]">{k}</span>
                <span className="font-semibold text-[13.5px] sm:text-[14px] text-right">{v}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "reviews" && (
          // No review system yet, so no invented quotes: an honest empty state
          // plus the store's real guarantees.
          <div className="max-w-[760px] rounded-2xl border border-line bg-gradient-to-br from-[#FFF7F5] via-white to-white p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid place-items-center w-12 h-12 rounded-full bg-accent-soft text-accent-deep shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
              <div>
                <div className="font-display text-[20px] sm:text-[22px] leading-tight">{t("pdp.revEmptyT")}</div>
                <p className="text-muted text-[14.5px] leading-relaxed mt-1.5">{t("pdp.revEmptyD")}</p>
              </div>
            </div>
            <ul className="mt-6 grid sm:grid-cols-2 gap-2.5">
              {["pdp.revTrust1", "pdp.revTrust2"].map((k, i) => (
                <li key={k} className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 text-[13.5px] font-medium rise-in"
                  style={{ animationDelay: `${40 + i * 60}ms` }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "faq" && (
          <div className="max-w-[760px] grid gap-2.5">
            {[
              [t("pdp.faq1Q"), t("pdp.faq1A")],
              [t("pdp.faq2Q"), t("pdp.faq2A")],
              [t("pdp.faq3Q"), t("pdp.faq3A")],
              [t("pdp.faq4Q"), t("pdp.faq4A")],
            ].map(([q, a], i) => (
              <details key={q}
                className="group rounded-2xl border border-line bg-white px-5 py-4 shadow-soft open:shadow-card transition-shadow rise-in"
                style={{ animationDelay: `${40 + i * 55}ms` }}>
                <summary className="flex items-center justify-between gap-4 cursor-pointer font-semibold text-[15px] list-none">
                  {q}
                  <span className="shrink-0 w-7 h-7 rounded-full bg-surface-2 grid place-items-center text-ink transition-transform duration-300 group-open:rotate-45">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                </summary>
                <p className="mt-3 text-muted text-[14.5px] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
