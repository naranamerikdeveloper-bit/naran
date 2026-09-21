import { LocaleLink as Link } from "@/components/LocaleLink";

const Sparkle = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`} aria-hidden="true">
    <path d="M12 0c.7 4.9 2.1 8.9 4.9 11.1C14.1 13.3 12.7 17.2 12 24c-.7-6.8-2.1-10.7-4.9-12.9C9.9 8.9 11.3 4.9 12 0Z"/>
  </svg>
);

/** Edge fades so rows dissolve in/out instead of clipping hard. */
const Fades = () => (
  <>
    <div className="absolute inset-y-0 left-0 w-16 sm:w-40 z-10 pointer-events-none bg-gradient-to-r from-white to-transparent" />
    <div className="absolute inset-y-0 right-0 w-16 sm:w-40 z-10 pointer-events-none bg-gradient-to-l from-white to-transparent" />
  </>
);

/**
 * Brand band: two rows gliding in opposite directions.
 *  • top — large serif phrases, alternating solid ink and coral outline, with
 *    "NARAN" set in coral italic; decorative (aria-hidden).
 *  • bottom — the store's real brands as pills that link to the brand filter.
 * Both pause on hover.
 */
export function Marquee({ items, brands = [] }: { items: string[]; brands?: string[] }) {
  const words = [...items, ...items];
  const pills = brands.length ? [...brands, ...brands] : [];
  let solid = false;

  return (
    <div className="relative">
      {/* Row 1 — phrases */}
      <div className="group relative overflow-hidden" aria-hidden="true">
        <Fades />
        <div className="flex items-center gap-6 sm:gap-10 whitespace-nowrap animate-marquee group-hover:[animation-play-state:paused]"
             style={{ width: "max-content" }}>
          {words.map((s, i) => {
            const brand = s === "NARAN";
            if (!brand) solid = !solid;
            return (
              <span key={i} className="flex items-center gap-6 sm:gap-10">
                <span className={
                  brand
                    ? "font-display italic text-[34px] sm:text-[56px] leading-none tracking-tight text-accent"
                    : solid
                      ? "font-display text-[34px] sm:text-[56px] leading-none tracking-tight text-ink"
                      : "font-display text-[34px] sm:text-[56px] leading-none tracking-tight text-transparent [-webkit-text-stroke:1.2px_#E76F61]"
                }>{s}</span>
                <Sparkle className="w-4 h-4 sm:w-6 sm:h-6 text-accent/70" />
              </span>
            );
          })}
        </div>
      </div>

      {/* Row 2 — brands */}
      {pills.length > 0 && (
        <div className="group relative overflow-hidden mt-6 sm:mt-8">
          <Fades />
          <div className="flex items-center gap-3 whitespace-nowrap animate-marquee-rev group-hover:[animation-play-state:paused]"
               style={{ width: "max-content" }}>
            {pills.map((b, i) => (
              <Link key={i} href={`/shop?brand=${encodeURIComponent(b)}`}
                aria-hidden={i >= brands.length || undefined} tabIndex={i >= brands.length ? -1 : undefined}
                className="inline-flex items-center gap-2.5 h-11 sm:h-12 px-5 sm:px-6 rounded-pill bg-white border border-accent/20 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[.22em] text-ink/75 shadow-[0_6px_18px_-12px_rgba(231,111,97,.45)] transition-all duration-300 hover:text-white hover:bg-accent hover:border-accent hover:-translate-y-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/70" aria-hidden="true" />
                {b}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
