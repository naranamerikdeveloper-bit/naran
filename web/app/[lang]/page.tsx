import { LocaleLink as Link } from "@/components/LocaleLink";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/types";
import { Photo } from "@/components/Photo";
import { HeroCarousel, type Slide } from "@/components/HeroCarousel";
import { ArrowUpRight, ArrowRight } from "@/components/Icons";
import { api } from "@/lib/api";
import { medusa } from "@/lib/medusa";
import { PRODUCT_IMG, HERO_IMG, FILM_IMG, productImg } from "@/lib/images";
import { NewsletterForm } from "./_components/NewsletterForm";
import { Reveal } from "./_components/Reveal";
import { ValueProps } from "./_components/ValueProps";
import { CategoryRail } from "./_components/CategoryRail";
import { Marquee } from "./_components/Marquee";
import { tFor, type Lang } from "@/lib/i18n";

export const revalidate = 300;

const CATS = [
  { key: "cat.all",        href: "/shop",                     img: HERO_IMG },
  { key: "cat.Fragrance",  href: "/shop?category=Fragrance",  img: PRODUCT_IMG.p1 },
  { key: "cat.Body",       href: "/shop?category=Body",       img: PRODUCT_IMG.p3 },
  { key: "cat.Gift",       href: "/shop?category=Gift",       img: PRODUCT_IMG.p5 },
];

export default async function HomePage({ params }: { params: { lang: Lang } }) {
  const t = tFor(params.lang);
  const L = params.lang;
  // Resilient fetch: a transient catalog/CMS outage must never fail the whole
  // build (mirrors generateStaticParams' catch elsewhere). The page prerenders
  // with whatever it got and ISR (revalidate) backfills once the backend is up.
  const [productsRes, cms] = await Promise.all([
    api.products.list({}).catch(() => ({ data: [] as Product[] })),
    medusa.homepageContent(),
  ]);
  const products = productsRes.data;
  // `hot` can be undefined if the catalog is empty (new/misconfigured store or a
  // transient Medusa error) — never dereference it directly (H2).
  const hot = products.find(p => p.badge === "Sale") || products[0];
  const hotImg = hot ? (hot.image ?? productImg(hot.id)) : HERO_IMG;

  const defaultSlides: Slide[] = [
    { kicker: t("home.s1Kicker"), top: t("home.s1Top"), accent: t("home.s1Accent"), desc: t("home.s1Desc"), img: FILM_IMG, href: "/shop" },
    { kicker: t("home.s2Kicker"), top: t("home.s2Top"), accent: t("home.s2Accent"), desc: t("home.s2Desc"), img: PRODUCT_IMG.p1, href: "/shop?type=EDP" },
    { kicker: t("home.s3Kicker"), top: t("home.s3Top"), accent: t("home.s3Accent"), desc: t("home.s3Desc"), img: PRODUCT_IMG.p5, href: "/shop?category=Gift" },
  ];
  // Admin CMS overrides the defaults when hero slides have been configured.
  const slides: Slide[] = cms?.hero?.length
    ? cms.hero.map(s => ({
        kicker: s.kicker[L] || s.kicker.mn,
        top: s.top[L] || s.top.mn,
        accent: s.accent[L] || s.accent.mn,
        desc: s.desc[L] || s.desc.mn,
        img: s.img || FILM_IMG,
        href: s.href || "/shop",
      }))
    : defaultSlides;

  // Promo banner: CMS when enabled, else the built-in copy.
  const promo = cms?.promo?.enabled
    ? {
        kicker: cms.promo.kicker[L] || cms.promo.kicker.mn,
        title: cms.promo.title[L] || cms.promo.title.mn,
        desc: cms.promo.desc[L] || cms.promo.desc.mn,
        cta: cms.promo.cta[L] || cms.promo.cta.mn,
        href: cms.promo.href || "/shop?filter=sale",
        img: cms.promo.img || hotImg,
      }
    : {
        kicker: t("home.promoKicker"), title: t("home.promoTitle"), desc: t("home.promoDesc"),
        cta: t("home.promoCta"), href: "/shop?filter=sale", img: hotImg,
      };

  // Site-wide structured data (Organization + WebSite with a Sitelinks search box).
  const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://naran.mn").replace(/\/$/, "");
  const structuredData = [
    { "@context": "https://schema.org", "@type": "Organization", name: "NARAN", url: SITE, logo: `${SITE}/icon.svg` },
    {
      "@context": "https://schema.org", "@type": "WebSite", name: "NARAN", url: SITE,
      potentialAction: { "@type": "SearchAction", target: `${SITE}/${L}/shop?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1280px] mx-auto">
          <Nav />

          {/* ===================== HERO CAROUSEL ===================== */}
          <section className="mt-5">
            <HeroCarousel slides={slides}/>
          </section>

          {/* ===================== CATEGORY ===================== */}
          <section className="mt-10 sm:mt-12">
            <Reveal className="flex items-end justify-between mb-5">
              <h2 className="font-display text-[24px] sm:text-[28px] tracking-tight">{t("home.category")}</h2>
              <Link href="/shop" className="text-accent text-[13px] font-semibold hover:text-accent-deep transition-colors">{t("common.seeAll")}</Link>
            </Reveal>
            <Reveal delay={0.08}>
              <CategoryRail items={CATS.map(c => ({ label: t(c.key), href: c.href, img: c.img }))} />
            </Reveal>
          </section>

          {/* ===================== VALUE PROPS ===================== */}
          <ValueProps lang={params.lang} />

          {/* ===================== RECOMMEND ===================== */}
          <section className="mt-9">
            <Reveal className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[22px] sm:text-[24px] tracking-tight">{t("home.recommended")}</h2>
              <Link href="/shop" className="text-accent text-[13px] font-semibold hover:text-accent-deep transition-colors">{t("common.seeAll")}</Link>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {products.slice(0, 8).map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}
            </div>
          </section>
        </div>
      </div>

      {/* ===================== MARQUEE ===================== */}
      <section className="py-11 sm:py-16 mt-10 sm:mt-14 bg-mist border-y border-line">
        <Marquee items={[t("home.mqA"), "NARAN", t("home.mqB"), "NARAN", t("home.mqC"), "NARAN", t("home.mqD"), "NARAN"]} />
      </section>

      {/* ===================== PROMO BANNER ===================== */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <Reveal blur>
            <div className="relative overflow-hidden rounded-[2rem] bg-accent text-white grid grid-cols-1 lg:grid-cols-2 items-center min-h-[280px]">
              <div className="absolute -right-20 -bottom-20 w-72 h-72 rounded-full bg-white/15 blur-2xl"/>
              <div className="relative z-10 p-8 sm:p-12">
                <span className="eyebrow text-ink/75">{promo.kicker}</span>
                <h2 className="hd-2 mt-3 text-ink">{promo.title}</h2>
                <p className="text-ink/80 mt-3 max-w-[360px]">{promo.desc}</p>
                <Link href={promo.href} className="btn btn-light mt-6">
                  {promo.cta}
                  <span className="arrow-cap"><ArrowUpRight width={14} height={14}/></span>
                </Link>
              </div>
              <div className="relative h-[220px] lg:h-full min-h-[240px]">
                <Photo src={promo.img} alt={promo.title}
                  fallback={<div className="absolute inset-0"/>}
                  imgClassName="absolute inset-0 w-full h-full object-cover"/>
                <div className="absolute inset-0 bg-gradient-to-r from-accent via-accent/40 to-transparent lg:from-accent/80"/>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== NEW ARRIVALS ===================== */}
      <section className="pb-16 lg:pb-24">
        <div className="container">
          <Reveal>
            <div className="flex items-center justify-between mb-8">
              <div>
                <span className="eyebrow">{t("home.justDropped")}</span>
                <h2 className="font-display text-[28px] sm:text-[36px] tracking-tight mt-2">{t("home.newArrivals")}</h2>
              </div>
              <Link href="/shop?filter=new" className="btn btn-outline btn-sm hidden sm:inline-flex">{t("common.viewAll")} <ArrowRight width={14} height={14}/></Link>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {products.slice(4, 12).map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}
          </div>
          <div className="flex justify-center mt-10">
            <Link href="/shop" className="btn btn-dark">
              {t("home.browseAll")}
              <span className="arrow-cap !bg-white !text-ink"><ArrowUpRight width={14} height={14}/></span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== NEWSLETTER ===================== */}
      <section className="pb-16 lg:pb-24">
        <div className="container">
          <Reveal blur
            className="relative overflow-hidden text-ink rounded-[1.75rem] sm:rounded-[2.25rem] p-8 sm:p-14 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center border border-line bg-white shadow-[0_24px_60px_-40px_rgba(232,85,10,.35)]">
            {/* faint warm corner bloom — matches the footer */}
            <div className="pointer-events-none absolute -top-24 right-[8%] h-56 w-56 rounded-full bg-accent/10 blur-3xl"/>
            <div className="relative z-10">
              <span className="eyebrow text-accent">{t("home.newsKicker")}</span>
              <h2 className="font-display text-[32px] sm:text-[44px] tracking-tight mt-3 leading-[.95] text-ink">
                {t("home.newsTitle")}
              </h2>
              <p className="text-muted mt-4 max-w-[400px]">{t("home.newsDesc")}</p>
            </div>
            <NewsletterForm />
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}
