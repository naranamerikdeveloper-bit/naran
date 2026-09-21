import { tFor, type Lang } from "@/lib/i18n";
import { Reveal } from "./Reveal";

const ico = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const Truck = () => (<svg {...ico}><path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>);
const Returns = () => (<svg {...ico}><path d="M3 9a9 9 0 0 1 15-3l3 3"/><path d="M21 4v5h-5"/><path d="M21 15a9 9 0 0 1-15 3l-3-3"/><path d="M3 20v-5h5"/></svg>);
const Shield = () => (<svg {...ico}><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>);
const Secure = () => (<svg {...ico}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);

const ITEMS = [
  { Icon: Truck, k: "home.vpShip", s: "home.vpShipSub" },
  { Icon: Returns, k: "home.vpReturns", s: "home.vpReturnsSub" },
  { Icon: Shield, k: "home.vpWarranty", s: "home.vpWarrantySub" },
  { Icon: Secure, k: "home.vpSecure", s: "home.vpSecureSub" },
];

export function ValueProps({ lang }: { lang: Lang }) {
  const t = tFor(lang);
  // One quiet strip instead of four floating cards: equal columns split by
  // hairlines (2×2 on mobile), each a coral icon chip + label.
  return (
    <section className="mt-6 sm:mt-8">
      <Reveal y={18}>
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[1.6rem] border border-line bg-gradient-to-br from-[#FFF7F5] via-white to-white overflow-hidden">
          {ITEMS.map(({ Icon, k, s }, i) => (
            <div key={k} className={`group flex items-center gap-3 sm:gap-4 px-4 py-5 sm:px-6 sm:py-6 border-line ${
              i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""} ${i === 1 ? "lg:border-r" : ""}`}>
              <span className="grid place-items-center w-11 h-11 sm:w-12 sm:h-12 rounded-full shrink-0 bg-accent-soft text-accent-deep transition-all duration-300 group-hover:bg-accent group-hover:text-white group-hover:scale-105">
                <Icon />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[13.5px] sm:text-[15px] leading-tight">{t(k)}</div>
                <div className="text-[12px] sm:text-[12.5px] text-muted mt-0.5 leading-snug">{t(s)}</div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
