import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { api, money } from "@/lib/api";
import { productImg } from "@/lib/images";
import { AddToCart } from "./_AddToCart";
import { Tabs } from "./_Tabs";
import { Gallery } from "./_Gallery";
import { Reveal } from "@/app/[lang]/_components/Reveal";
import { tFor, type Lang, LOCALES } from "@/lib/i18n";

// ISR: cacheable data fetches + no cookies() → product pages render statically
// and revalidate in the background (fast LCP).
export const revalidate = 300;
export const dynamicParams = true; // products not prerendered below render on-demand

// Prerender existing products (both locales) as static HTML. For a very large
// catalog, cap this to top-N and let the rest render on-demand (dynamicParams).
export async function generateStaticParams() {
  try {
    const { data } = await api.products.list({});
    return LOCALES.flatMap(lang => data.map(p => ({ lang, id: p.slug })));
  } catch {
    return [];
  }
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://naran.mn").replace(/\/$/, "");

// Per-product SEO: title, description, canonical, and Open Graph image.
export async function generateMetadata({ params }: { params: { lang: string; id: string } }): Promise<Metadata> {
  try {
    const { data: p } = await api.products.get(params.id);
    const url = `${SITE_URL}/${params.lang}/product/${p.slug}`;
    const desc = (p.shortDesc || p.description || `${p.name} — NARAN`).slice(0, 160);
    const img = p.image ?? productImg(p.id);
    return {
      title: `${p.name} — NARAN`,
      description: desc,
      alternates: {
        canonical: url,
        languages: {
          mn: `${SITE_URL}/mn/product/${p.slug}`,
          en: `${SITE_URL}/en/product/${p.slug}`,
        },
      },
      openGraph: { title: `${p.name} — NARAN`, description: desc, url, type: "website", images: [{ url: img }] },
    };
  } catch {
    return { title: "Бараа — NARAN" };
  }
}

export default async function ProductPage({ params }: { params: { lang: Lang; id: string } }) {
  const t = tFor(params.lang);
  // A missing/invalid slug (or a deleted product) must render a proper 404, not a
  // 500 error boundary — otherwise Google treats removed pages as broken (H1).
  let product: Awaited<ReturnType<typeof api.products.get>>["data"];
  let related: Awaited<ReturnType<typeof api.products.get>>["related"];
  try {
    ({ data: product, related } = await api.products.get(params.id));
  } catch {
    notFound();
  }
  const img = product.image ?? productImg(product.id);

  // schema.org Product/Offer structured data (rich results).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [img],
    description: product.shortDesc || product.description || product.name,
    category: product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "MNT",
      price: product.price,
      availability: (product.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE_URL}/${params.lang}/product/${product.slug}`,
    },
    ...(product.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviews || 1 } } : {}),
  };

  // Breadcrumb trail for rich results (Нүүр › Дэлгүүр › Бараа).
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("bc.home"), item: `${SITE_URL}/${params.lang}` },
      { "@type": "ListItem", position: 2, name: t("bc.shop"), item: `${SITE_URL}/${params.lang}/shop` },
      { "@type": "ListItem", position: 3, name: product.name, item: `${SITE_URL}/${params.lang}/product/${product.slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbLd]).replace(/</g, "\\u003c") }} />
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1280px] mx-auto">
          <Nav />

          <div className="text-[11px] font-mono tracking-wider text-subtle flex items-center gap-2 mt-6">
            <Link href="/" className="hover:text-ink uppercase">{t("bc.home")}</Link><span className="opacity-40">/</span>
            <Link href="/shop" className="hover:text-ink uppercase">{t("bc.shop")}</Link><span className="opacity-40">/</span>
            <span className="text-ink uppercase">{product.name}</span>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 mt-5">
            {/* Gallery */}
            <Gallery product={product} img={img}/>

            {/* Side */}
            <div className="bg-white border border-line rounded-[1.5rem] p-6 sm:p-8 shadow-soft h-fit">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-surface-2 text-[12px] font-medium uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: product.accent }}/> {product.category}
              </span>
              <h1 className="font-display text-[28px] sm:text-[40px] uppercase tracking-[-.02em] leading-[.95] mt-4">{product.name}</h1>
              <div className="flex items-center gap-2 text-[13px] text-muted mt-3" role="img" aria-label={`${t("common.rating")}: ${product.rating} / 5`}>
                <span className="text-[#F4B400]" aria-hidden>★★★★★</span>
                <span className="num-tabular">{product.rating}</span><span className="opacity-40" aria-hidden>·</span>
                <span className="num-tabular">{product.reviews.toLocaleString()} {t("common.reviews")}</span>
              </div>

              <div className="flex items-baseline gap-3 mt-5">
                {new Set((product.variants ?? []).map(v => v.price).filter(n => n != null)).size > 1 && (
                  <span className="text-[13px] text-muted">{t("common.from")}</span>
                )}
                <span className="font-display text-[30px] text-accent-deep">{money(product.price)}</span>
                {product.was && <span className="text-subtle line-through num-tabular">{money(product.was)}</span>}
                {product.was && (
                  <span className="bg-accent-soft text-accent-deep px-2.5 py-1 rounded-pill text-xs font-semibold">
                    −{Math.round((1 - product.price / product.was) * 100)}%
                  </span>
                )}
              </div>

              <p className="text-[12px] uppercase tracking-[.16em] text-subtle font-medium mt-5 mb-2">{product.fabric}</p>
              <p className="text-muted text-[15px] leading-relaxed">{product.description}</p>

              <AddToCart product={product}/>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-line">
                <Trust label={t("pdp.trustShipping")}/>
                <Trust label={t("pdp.trustReturns")}/>
                <Trust label={t("pdp.trustWarranty")}/>
              </div>
            </div>
          </section>

          <Tabs product={product}/>

          <section className="pt-8 pb-10">
            <Reveal>
              <h2 className="font-display text-[24px] sm:text-[32px] uppercase tracking-tight mb-5">{t("pdp.youMayLikePre")} <span className="text-accent">{t("pdp.youMayLikeAccent")}</span></h2>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {related.map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}
            </div>
          </section>
        </div>
      </div>

      <Footer />
    </>
  );
}

function Trust({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-muted">
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="m5 12 5 5L20 7"/>
      </svg>
      {label}
    </div>
  );
}
