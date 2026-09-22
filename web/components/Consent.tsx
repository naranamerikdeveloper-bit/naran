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
        <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-[420px] z-[60] card p-5 shadow-lift border border-border">
          <p className="text-sm text-muted leading-relaxed">
            {t("cookie.text")}{" "}
            <Link href="/privacy" className="underline hover:text-ink">{t("foot.privacy")}</Link>
          </p>
          <div className="flex gap-2.5 mt-4">
            <button onClick={() => decide("accepted")} className="btn btn-primary flex-1 min-w-0 justify-center h-11 px-3 text-[12px] whitespace-normal leading-tight">{t("cookie.accept")}</button>
            <button onClick={() => decide("declined")} className="btn btn-outline flex-1 min-w-0 justify-center h-11 px-3 text-[12px] whitespace-normal leading-tight text-center">{t("cookie.decline")}</button>
          </div>
        </div>
      )}
    </>
  );
}
