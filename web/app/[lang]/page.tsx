import { LocaleLink as Link } from "@/components/LocaleLink";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import type { ListResult } from "@/lib/types";
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

// Category bento candidates, in display order: fragrance types first (almost
// the whole catalog is fragrance), then non-fragrance categories. Only the
// populated ones are shown.
const TILES: { kind: "type" | "cat"; key: string; label: string; href: string }[] = [
  { kind: "type", key: "EDP",     label: "nav.edp",  href: "/shop?type=EDP" },
  { kind: "type", key: "EDT",     label: "nav.edt",  href: "/shop?type=EDT" },
  { kind: "cat",  key: "Body",    label: "cat.Body", href: "/shop?category=Body" },
  { kind: "cat",  key: "Gift",    label: "cat.Gift", href: "/shop?category=Gift" },
  { kind: "type", key: "Parfum",  label: "home.tParfum", href: "/shop?type=Parfum" },
  { kind: "type", key: "Extrait", label: "home.tExtrait", href: "/shop?type=Extrait" },
  { kind: "type", key: "Cologne", label: "home.tCologne", href: "/shop?type=Cologne" },
];

export default async function HomePage({ params }: { params: { lang: Lang } }) {
  const t = tFor(params.lang);
  const L = params.lang;
  // Resilient fetch: a transient catalog/CMS outage must never fail the whole
  // build (mirrors generateStaticParams' catch elsewhere). The page prerenders
  // with whatever it got and ISR (revalidate) backfills once the backend is up.
  const [productsRes, cms] = await Promise.all([
    api.products.list({}).catch((): ListResult => ({ data: [], total: 0 })),
    medusa.homepageContent(),
  ]);
  const products = productsRes.data;
  // `hot` can be undefined if the catalog is empty (new/misconfigured store or a
  // transient Medusa error) — never dereference it directly (H2).
  const hot = products.find(p => p.badge === "Sale") || products[0];
  const hotImg = hot ? (hot.image ?? productImg(hot.id)) : HERO_IMG;

  // Category bento: live counts + a real product photo per tile.
  const facets = productsRes.facets;
  const countOf = (kind: "type" | "cat", key: string) =>
    (kind === "type" ? facets?.types : facets?.categories)?.find(f => f.key === key)?.count ?? 0;
  const picOf = (kind: "type" | "cat", key: string) =>
    products.find(p => p.image && (kind === "type" ? p.fragranceType === key : p.category === key))?.image;
  const brandTotal = facets?.brands.length ?? 0;
  const catFeature = {
    label: t("home.shopAll"),
    sub: `${products.length} ${t("home.items")}${brandTotal ? ` · ${brandTotal} ${t("home.brands")}` : ""}`,
    href: "/shop",
    img: HERO_IMG,
  };
  const catTiles = TILES
    .map(c => ({ ...c, n: countOf(c.kind, c.key) }))
    .filter(c => c.n > 0)
    .slice(0, 3)
    .map(c => ({ label: t(c.label), sub: `${c.n} ${t("home.items")}`, href: c.href, img: picOf(c.kind, c.key) }));

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
        href: cms.promo.href || "/shop",
        img: cms.promo.img || hotImg,
      }
    : {
        kicker: t("home.promoKicker"), title: t("home.promoTitle"), desc: t("home.promoDesc"),
        cta: t("home.promoCta"), href: "/shop", img: hotImg,
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
            <Reveal className="flex items-end justify-between mb-5 sm:mb-6">
              <div>
                <div className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-[.24em] text-accent mb-1.5">{t("home.catKicker")}</div>
                <h2 className="font-display text-[26px] sm:text-[34px] tracking-tight leading-none">{t("home.category")}</h2>
              </div>
              <Link href="/shop" className="text-accent text-[13px] font-semibold hover:text-accent-deep transition-colors">{t("common.seeAll")}</Link>
            </Reveal>
            <Reveal delay={0.08}>
              <CategoryRail feature={catFeature} items={catTiles} />
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
      <section className="py-12 sm:py-16 mt-10 sm:mt-14 border-y border-line bg-white">
        <Marquee kicker={t("home.brandsKicker")} />
      </section>

      {/* ===================== PROMO BANNER ===================== */}
      <section className="py-16 lg:py-24">
        <div className="container">
          <Reveal blur>
            {/* Editorial promo: the photo fills the card and melts into white on the
                left (bottom on mobile); ink type, coral only as the small accent. */}
            <div className="group relative isolate overflow-hidden rounded-[2rem] border border-line bg-[#FBF7F5] min-h-[440px] sm:min-h-[380px]">
              <Photo src={promo.img} alt={promo.title} sizes="(max-width: 1024px) 100vw, 1280px"
                fallback={<div className="absolute inset-0 bg-gradient-to-br from-accent-soft to-white"/>}
                imgClassName="absolute inset-0 w-full h-full object-cover object-[70%_30%] transition-transform duration-[1400ms] ease-elegant group-hover:scale-[1.04]"/>
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/90 via-45% to-white/0 sm:bg-gradient-to-r sm:from-white sm:via-white/85 sm:via-40% sm:to-white/0 sm:to-75%"/>
              <div className="relative z-10 flex flex-col justify-end sm:justify-center min-h-[inherit] p-7 sm:p-12 lg:p-14 max-w-[560px]">
                <span className="inline-flex items-center gap-2 w-fit h-8 px-3.5 rounded-pill bg-white/80 backdrop-blur border border-accent/20 text-[11px] font-semibold uppercase tracking-[.2em] text-accent-deep">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent"/> {promo.kicker}
                </span>
                <h2 className="font-display text-[34px] sm:text-[46px] lg:text-[54px] leading-[1.02] tracking-tight text-ink mt-4">{promo.title}</h2>
                {promo.desc && <p className="text-muted text-[15px] leading-relaxed mt-3 max-w-[400px]">{promo.desc}</p>}
                <Link href={promo.href} className="btn mt-7 w-fit bg-ink text-white hover:bg-black hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-14px_rgba(10,10,11,.5)]">
                  {promo.cta}
                  <span className="arrow-cap"><ArrowUpRight width={14} height={14}/></span>
                </Link>
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
            <Link href="/shop" className="btn btn-outline">
              {t("home.browseAll")}
              <ArrowRight width={16} height={16}/>
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== NEWSLETTER ===================== */}
      <section className="pb-16 lg:pb-24">
        <div className="container">
          <Reveal blur
            className="relative overflow-hidden text-ink rounded-[1.75rem] sm:rounded-[2.25rem] p-8 sm:p-14 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center border border-line bg-white shadow-[0_24px_60px_-40px_rgba(211,90,76,.35)]">
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
