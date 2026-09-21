import { LocaleLink as Link } from "@/components/LocaleLink";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { ArrowRight, SearchIcon } from "@/components/Icons";
import { api } from "@/lib/api";
import { tFor, type Lang } from "@/lib/i18n";
import type { Product } from "@/lib/types";
import { SortSelect, ShopFilters } from "./_ShopControls";
import { Reveal } from "@/app/[lang]/_components/Reveal";
import type { Metadata } from "next";

// Reads searchParams (filters) → dynamic; product data is still fetch-cached.
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://naran.mn").replace(/\/$/, "");

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = tFor(params.lang);
  const title = `${t("shop.titleAccent")} — NARAN`;
  const description = params.lang === "mn"
    ? "NARAN дэлгүүрийн бүх бүтээгдэхүүн — үнэртэй ус, арьс арчилгаа, гоо сайхан. 100% жинхэнэ, QPay-ээр төлнө."
    : "Browse all NARAN products — fragrance, skincare and makeup. 100% authentic, pay with QPay.";
  const url = `${SITE}/${params.lang}/shop`;
  return {
    title,
    description,
    alternates: { canonical: url, languages: { mn: `${SITE}/mn/shop`, en: `${SITE}/en/shop` } },
    openGraph: { title, description, url, type: "website", siteName: "NARAN" },
  };
}

const cats = ["all", "Fragrance", "Skincare", "Makeup", "Body", "Gift"];
const PAGE_SIZE = 48;

type ShopParams = { category?: string; sort?: string; q?: string; gender?: string; filter?: string; color?: string; tech?: string; minPrice?: string; maxPrice?: string; page?: string };

// Page links keep every active filter and only swap `page`.
function pageHref(sp: ShopParams, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") q.set(k, v);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/shop?${s}` : "/shop";
}

function Pager({ sp, page, pages }: { sp: ShopParams; page: number; pages: number }) {
  if (pages <= 1) return null;
  // First, last, and a window around the current page; gaps become "…".
  const nums = Array.from(new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages))).sort((a, b) => a - b);
  const cell = "h-10 min-w-10 px-3 rounded-pill inline-flex items-center justify-center text-[14px] num-tabular transition";
  return (
    <nav aria-label="Хуудаслалт" className="flex items-center justify-center gap-1.5 mt-10 flex-wrap">
      {page > 1 && <Link href={pageHref(sp, page - 1)} className={`${cell} border border-line bg-white hover:border-ink`} aria-label="Өмнөх">‹</Link>}
      {nums.map((n, i) => (
        <span key={n} className="contents">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-subtle">…</span>}
          {n === page
            ? <span aria-current="page" className={`${cell} bg-ink text-white`}>{n}</span>
            : <Link href={pageHref(sp, n)} className={`${cell} border border-line bg-white hover:border-ink`}>{n}</Link>}
        </span>
      ))}
      {page < pages && <Link href={pageHref(sp, page + 1)} className={`${cell} border border-line bg-white hover:border-ink`} aria-label="Дараах">›</Link>}
    </nav>
  );
}

export default async function ShopPage({
  params,
  searchParams,
}: { params: { lang: Lang }; searchParams: ShopParams }) {
  const t = tFor(params.lang);
  // Resilient: a catalog outage degrades to the empty state, never a 500.
  const [listRes, allForColors] = await Promise.all([
    api.products.list({
      category: searchParams.category,
      sort: searchParams.sort,
      q: searchParams.q,
      gender: searchParams.gender,
      filter: searchParams.filter,
      color: searchParams.color,
      tech: searchParams.tech,
      minPrice: searchParams.minPrice,
      maxPrice: searchParams.maxPrice,
    }).catch(() => ({ data: [] as Product[], total: 0 })),
    api.products.list({}).catch(() => ({ data: [] as Product[] })),
  ]);
  const { data: all, total } = listRes;
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(searchParams.page)) || 1));
  const products = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Real swatches: unique product accents, so every colour chip yields results.
  const availableColors = Array.from(new Set(allForColors.data.map(p => p.accent)));

  return (
    <>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1280px] mx-auto">
          <Nav />

          {/* Title */}
          <header className="mt-6 sm:mt-8">
            <Reveal>
              <div className="text-[11px] font-mono tracking-wider text-subtle flex items-center gap-2">
                <Link href="/" className="hover:text-ink uppercase">{t("bc.home")}</Link><span className="opacity-40">/</span>
                <span className="text-ink uppercase">{t("bc.shop")}</span><span className="opacity-40 mx-1">·</span><span>{total} {t("shop.items")}</span>
              </div>
              <h1 className="font-display text-[34px] sm:text-[52px] tracking-tight leading-[.95] uppercase mt-3">
                {t("shop.titlePre")} <span className="text-accent">{t("shop.titleAccent")}</span>
              </h1>
            </Reveal>
          </header>

          {/* Sticky toolbar: categories + sort */}
          <div className="sticky top-2 z-20 mt-5 -mx-3 px-3 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur border border-line rounded-pill p-1.5 shadow-soft">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
                {cats.map(c => {
                  const active = (!searchParams.category && c === "all") || searchParams.category === c;
                  return (
                    <Link key={c} href={c === "all" ? "/shop" : `/shop?category=${encodeURIComponent(c)}`}
                      className={`h-9 px-4 rounded-pill text-[13px] font-medium inline-flex items-center whitespace-nowrap shrink-0 transition ${
                        active ? "bg-ink text-white" : "text-muted hover:text-ink"
                      }`}>
                      {t(`cat.${c}`)}
                    </Link>
                  );
                })}
              </div>
              <div className="shrink-0">
                <SortSelect/>
              </div>
            </div>
          </div>

          {/* Collapsible filters */}
          <ShopFilters colors={availableColors}/>

          {/* Grid */}
          {products.length === 0 ? (
            <Reveal className="mt-10 bg-white border border-line rounded-2xl p-12 text-center">
              <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink/40">
                <SearchIcon width={26} height={26}/>
              </span>
              <h3 className="font-display text-[22px]">{t("shop.emptyTitle")}</h3>
              <p className="text-muted mt-2 text-sm max-w-[320px] mx-auto">{t("shop.emptyDesc")}</p>
              <Link href="/shop" className="btn btn-primary mt-6 inline-flex">{t("shop.reset")} <ArrowRight width={14} height={14}/></Link>
            </Reveal>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
                {products.map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}
              </div>
              <Pager sp={searchParams} page={page} pages={pages}/>
            </>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}
