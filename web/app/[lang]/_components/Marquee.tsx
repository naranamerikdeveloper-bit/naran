import { LocaleLink as Link } from "@/components/LocaleLink";
import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";

// Official wordmarks (public/brands, from Wikimedia Commons) for brands the store
// stocks. `name` must match the catalog brand so the link filters correctly;
// `h` evens out optical size — stacked/emblem marks need more height than
// single-line wordmarks.
const LOGOS: { slug: string; name: string; h: string }[] = [
  { slug: "chanel",           name: "CHANEL",             h: "h-6 sm:h-7" },
  { slug: "dior",             name: "DIOR",               h: "h-8 sm:h-9" },
  { slug: "versace",          name: "VERSACE",            h: "h-10 sm:h-12" },
  { slug: "gucci",            name: "GUCCI",              h: "h-10 sm:h-12" },
  { slug: "ysl",              name: "YVES SAINT LAURENT", h: "h-9 sm:h-10" },
  { slug: "dolce-gabbana",    name: "DOLCE & GABBANA",    h: "h-9 sm:h-10" },
  { slug: "givenchy",         name: "GIVENCHY",           h: "h-5 sm:h-6" },
  { slug: "lancome",          name: "LANCOME",            h: "h-8 sm:h-9" },
  { slug: "burberry",         name: "BURBERRY",           h: "h-6 sm:h-7" },
  { slug: "armani",           name: "ARMANI",             h: "h-5 sm:h-6" },
  { slug: "valentino",        name: "VALENTINO",          h: "h-10 sm:h-12" },
  { slug: "guerlain",         name: "GUERLAIN",           h: "h-5 sm:h-6" },
  { slug: "carolina-herrera", name: "CAROLINA HERRERA",   h: "h-4 sm:h-5" },
  { slug: "lanvin",           name: "LANVIN",             h: "h-5 sm:h-6" },
  { slug: "hugo-boss",        name: "HUGO BOSS",          h: "h-5 sm:h-6" },
  { slug: "calvin-klein",     name: "CALVIN KLEIN",       h: "h-5 sm:h-6" },
  { slug: "jimmy-choo",       name: "JIMMY CHOO",         h: "h-5 sm:h-6" },
  { slug: "moschino",         name: "MOSCHINO",           h: "h-6 sm:h-7" },
  { slug: "lacoste",          name: "LACOSTE",            h: "h-5 sm:h-6" },
];

/**
 * Brand logo band: real brand wordmarks gliding endlessly, dissolving into
 * progressive blur at both edges. Slows on hover; each logo links to the shop
 * filtered by that brand.
 */
export function Marquee({ kicker }: { kicker: string }) {
  return (
    <div>
      <p className="text-center text-[11px] sm:text-[12px] font-semibold uppercase tracking-[.28em] text-accent mb-7 sm:mb-10">
        {kicker}
      </p>
      <div className="relative h-[72px] sm:h-[96px] w-full overflow-hidden">
        <InfiniteSlider className="flex h-full w-full items-center" duration={45} durationOnHover={110} gap={64}>
          {LOGOS.map(l => (
            <Link key={l.slug} href={`/shop?brand=${encodeURIComponent(l.name)}`}
              aria-label={l.name}
              className="flex h-full min-w-[120px] sm:min-w-[150px] items-center justify-center opacity-55 grayscale transition duration-300 hover:opacity-100 hover:scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/brands/${l.slug}.svg`} alt={l.name} loading="lazy" draggable={false}
                className={`${l.h} w-auto max-w-[200px] object-contain select-none`} />
            </Link>
          ))}
        </InfiniteSlider>
        <ProgressiveBlur className="pointer-events-none absolute top-0 left-0 h-full w-[80px] sm:w-[200px]" direction="left" blurIntensity={1} />
        <ProgressiveBlur className="pointer-events-none absolute top-0 right-0 h-full w-[80px] sm:w-[200px]" direction="right" blurIntensity={1} />
      </div>
    </div>
  );
}
