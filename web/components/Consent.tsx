"use client";
import Script from "next/script";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useEffect, useState } from "react";
import { useT } from "./LangProvider";

const KEY = "naran-consent"; // "accepted" | "declined"
const GA = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// Cookie consent banner (NFR-08) + analytics loaders (FR-17). Analytics scripts
// (GA4, Meta Pixel) load ONLY after the visitor accepts AND the env id is set.
export function Consent() {
  const t = useT();
  const [choice, setChoice] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    try { setChoice(localStorage.getItem(KEY)); } catch { setChoice(null); }
  }, []);

  const decide = (v: "accepted" | "declined") => {
    try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
    setChoice(v);
  };

  const accepted = choice === "accepted";

  return (
    <>
      {accepted && GA && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`
            window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());gtag('config','${GA}');
          `}</Script>
        </>
      )}
      {accepted && PIXEL && (
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,
          'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${PIXEL}');fbq('track','PageView');
        `}</Script>
      )}

      {choice === null && (
        // Sits above the mobile tab bar (≈80px + safe area) and never overflows:
        // two equal buttons whose labels shrink/wrap rather than spill out.
        <div role="dialog" aria-label="Cookie"
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] lg:bottom-5 sm:inset-x-auto sm:right-5 sm:w-[400px] z-[60] rounded-2xl bg-white p-4 sm:p-5 shadow-[0_20px_50px_-20px_rgba(10,10,11,.4)] border border-line">
          <p className="text-[13px] sm:text-sm text-muted leading-relaxed">
            {t("cookie.text")}{" "}
            <Link href="/privacy" className="underline hover:text-ink">{t("foot.privacy")}</Link>
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3.5">
            <button onClick={() => decide("accepted")}
              className="h-11 min-w-0 px-2 rounded-pill bg-accent text-white text-[12.5px] font-semibold uppercase tracking-wide leading-tight hover:bg-accent-deep active:scale-[.97] transition">
              {t("cookie.accept")}
            </button>
            <button onClick={() => decide("declined")}
              className="h-11 min-w-0 px-2 rounded-pill border border-ink/20 bg-white text-ink text-[12.5px] font-semibold uppercase tracking-wide leading-tight hover:border-ink active:scale-[.97] transition">
              {t("cookie.decline")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
