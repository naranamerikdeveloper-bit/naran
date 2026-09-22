import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Outfit, Onest, Inter, JetBrains_Mono } from "next/font/google";
import "../globals.css";
import { Toast } from "@/components/Toast";
import { MobileTabBar } from "@/components/MobileTabBar";
import { CartDrawer } from "@/components/CartDrawer";
import { QuickViewModal } from "@/components/QuickViewModal";
import { FlyLayer } from "@/components/FlyLayer";
import { SmoothScroll } from "@/components/SmoothScroll";
import { LangProvider } from "@/components/LangProvider";
import { Consent } from "@/components/Consent";
import { LOCALES, isLang, tFor } from "@/lib/i18n";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://naranamerikbaraa.mn"),
  title: "Наран Америк Бараа — 100% оригинал үнэртэй ус",
  description: "АНУ, Канадаас албан ёсоор ирсэн 100% оригинал үнэртэй ус — Chanel, Dior, Versace, Gucci болон бусад. QPay-ээр төлж, 24–48 цагт хүргүүлээрэй.",
  openGraph: {
    title: "Наран Америк Бараа — 100% оригинал үнэртэй ус",
    description: "АНУ, Канадаас албан ёсоор ирсэн 100% оригинал үнэртэй ус — 24–48 цагт хүргэнэ.",
    type: "website",
    siteName: "NARAN",
  },
};

// Pre-render both locales → static/ISR pages, no cookies() (fast LCP).
export function generateStaticParams() {
  return LOCALES.map(lang => ({ lang }));
}

// Self-hosted via next/font: no render-blocking external CSS, no FOUT (swap + fallback).
// Only the weights actually used are requested — trims the font payload for a faster LCP.
// Headings: Outfit (geometric sans). Outfit has no Cyrillic at all, so Mongolian
// headings use Onest — the closest geometric face with full Cyrillic incl. Ү/Ө
// (U+04AE/U+04E8, cyrillic-ext). The CSS stack is Outfit → Onest, so each script
// gets a matching glyph instead of falling back to a system font.
const outfit = Outfit({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700", "800"], variable: "--font-outfit", display: "swap" });
const onest = Onest({ subsets: ["cyrillic", "cyrillic-ext"], weight: ["400", "500", "600", "700", "800"], variable: "--font-onest", display: "swap" });
// Body: Inter, with cyrillic-ext for Ү/Ө.
const inter = Inter({ subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export default function LangLayout({ children, params }: { children: React.ReactNode; params: { lang: string } }) {
  if (!isLang(params.lang)) notFound();
  const lang = params.lang;
  const t = tFor(lang);
  return (
    <html lang={lang} className={`${outfit.variable} ${onest.variable} ${inter.variable} ${mono.variable}`}>
      <body className="font-sans pb-24 lg:pb-0">
        <a href="#main" className="skip-link">{t("a11y.skip")}</a>
        <LangProvider lang={lang}>
          <SmoothScroll />
          <main id="main">{children}</main>
          <Toast />
          <CartDrawer />
          <QuickViewModal />
          <FlyLayer />
          <MobileTabBar />
          <Consent />
        </LangProvider>
      </body>
    </html>
  );
}
