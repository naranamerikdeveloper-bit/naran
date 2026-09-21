import { LocaleLink as Link } from "@/components/LocaleLink";
import { Photo } from "@/components/Photo";
import { ArrowUpRight } from "@/components/Icons";

export type Cat = { label: string; sub: string; href: string; img?: string };

const Arrow = ({ dark }: { dark?: boolean }) => (
  <span className={`grid place-items-center w-10 h-10 sm:w-11 sm:h-11 rounded-full shrink-0 transition-all duration-500 ease-spring group-hover:rotate-45 ${
    dark ? "bg-white text-ink group-hover:bg-accent group-hover:text-white" : "bg-accent text-white group-hover:bg-accent-deep"}`}>
    <ArrowUpRight width={16} height={16} />
  </span>
);

/**
 * Category bento: one large lifestyle tile ("shop all") beside up to three
 * tiles for the populated fragrance types / categories, each on a real product
 * photo with a live item count. Empty categories never make it here.
 */
export function CategoryRail({ feature, items }: { feature: Cat; items: Cat[] }) {
  const three = items.length >= 3;
  const tiles = items.slice(0, 3);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 md:grid-rows-2 gap-3 sm:gap-4 md:h-[480px]">
      {/* Feature tile */}
      <Link href={feature.href}
        className="group relative col-span-2 md:row-span-2 overflow-hidden rounded-[1.6rem] bg-graphite aspect-[16/11] md:aspect-auto isolate">
        <Photo src={feature.img} alt="" sizes="(max-width: 768px) 100vw, 640px"
          fallback={<span className="absolute inset-0 bg-gradient-to-br from-accent-soft to-petal" />}
          imgClassName="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-elegant group-hover:scale-[1.06]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A0F0D]/80 via-[#1A0F0D]/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 flex items-end justify-between gap-4 text-white">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.2em] text-petal">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> {feature.sub}
            </span>
            <div className="font-display text-[30px] sm:text-[42px] leading-[1.02] tracking-tight mt-2">{feature.label}</div>
          </div>
          <Arrow dark />
        </div>
      </Link>

      {/* Type / category tiles */}
      {tiles.map((c, i) => {
        const wide = !three || i === 0;         // desktop: first spans the row; 2-tile layouts both span
        const lastOddMobile = three && i === 2; // mobile: 3rd tile fills the row
        return (
          <Link key={c.href} href={c.href}
            className={`group relative overflow-hidden rounded-[1.6rem] bg-[#F3F1F0] isolate ${
              wide ? "md:col-span-2" : ""} ${lastOddMobile ? "col-span-2 md:col-span-1 aspect-[16/9]" : "aspect-[4/5]"} md:aspect-auto`}>
            <Photo src={c.img} alt="" sizes="(max-width: 768px) 50vw, 320px"
              fallback={<span className="absolute inset-0 bg-gradient-to-br from-accent-soft to-white" />}
              imgClassName="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-elegant group-hover:scale-[1.07]" />
            <div className="absolute inset-0 bg-gradient-to-t from-white from-10% via-white/60 via-35% to-transparent to-65%" />
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[.18em] text-accent-deep">{c.sub}</div>
                <div className="font-display text-[20px] sm:text-[26px] leading-[1.05] tracking-tight text-ink mt-1">{c.label}</div>
              </div>
              <Arrow />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
