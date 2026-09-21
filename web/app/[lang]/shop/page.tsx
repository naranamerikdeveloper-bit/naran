import { LocaleLink as Link } from "@/components/LocaleLink";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { ArrowRight, SearchIcon } from "@/components/Icons";
import { api } from "@/lib/api";
import { tFor, type Lang } from "@/lib/i18n";
import type { ListResult, Product } from "@/lib/types";
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
    ? "Дэлхийн 78 брэндийн оригинал үнэртэй ус — Eau de Parfum, Eau de Toilette, бэлгийн багц. QPay-ээр төлнө."
    : "Original fragrances from 78 houses — Eau de Parfum, Eau de Toilette and gift sets. Pay with QPay.";
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

type ShopParams = { category?: string; sort?: string; q?: string; brand?: string; type?: string; filter?: string; minPrice?: string; maxPrice?: string; page?: string };

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
            ? <span aria-current="page" className={`${cell} bg-accent-deep text-white`}>{n}</span>
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
  const listRes: ListResult = await api.products.list({
    category: searchParams.category,
    sort: searchParams.sort,
    q: searchParams.q,
    brand: searchParams.brand,
    type: searchParams.type,
    filter: searchParams.filter,
    minPrice: searchParams.minPrice,
    maxPrice: searchParams.maxPrice,
  }).catch(() => ({ data: [] as Product[], total: 0 }));
  const { data: all, total } = listRes;
  const facets = listRes.facets ?? { categories: [], brands: [], types: [], newCount: 0 };
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(searchParams.page)) || 1));
  const products = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Only categories that actually have products get a tab (an empty
  // "Skincare" tab is a dead end); the active one always stays visible.
  const catCount = new Map(facets.categories.map(c => [c.key, c.count]));
  const tabs = cats.filter(c => c === "all" || (catCount.get(c) ?? 0) > 0 || searchParams.category === c);
  const allCount = facets.categories.reduce((a, c) => a + c.count, 0);

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
                {tabs.map(c => {
                  const active = (!searchParams.category && c === "all") || searchParams.category === c;
                  const n = c === "all" ? allCount : catCount.get(c) ?? 0;
                  return (
                    <Link key={c} href={pageHref({ ...searchParams, category: c === "all" ? undefined : c }, 1)}
                      className={`h-9 px-4 rounded-pill text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                        active ? "bg-accent-deep text-white" : "text-muted hover:text-ink"
                      }`}>
                      {t(`cat.${c}`)}
                      <span className={`text-[11px] num-tabular ${active ? "opacity-70" : "text-subtle"}`}>{n}</span>
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
          <ShopFilters facets={facets}/>

          {/* Grid */}
          {products.length === 0 ? (
            <Reveal className="mt-10 bg-white border border-line rounded-2xl p-12 text-center">
              <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink/40">
                <SearchIcon width={26} height={26}/>
              </span>
              <h3 className="font-display text-[22px]">{t("shop.emptyTitle")}</h3>
              <p className="text-muted mt-2 text-sm max-w-[320px] mx-auto">{t("shop.emptyDesc")}</p>
              <Link href="/shop" className="btn btn-outline mt-6 inline-flex">{t("shop.reset")} <ArrowRight width={14} height={14}/></Link>
            </Reveal>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3.5 gap-y-8 sm:gap-x-5 sm:gap-y-11 lg:gap-x-6 lg:gap-y-12 mt-6">
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
