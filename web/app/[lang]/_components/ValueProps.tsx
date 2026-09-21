import { tFor, type Lang } from "@/lib/i18n";
import { Reveal } from "./Reveal";
import { TiltCard } from "./TiltCard";

const ico = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

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
  return (
    <section className="mt-10 sm:mt-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        {ITEMS.map(({ Icon, k, s }, i) => (
          <Reveal key={k} delay={i * 0.07} y={22} className="h-full">
            <TiltCard className="group h-full flex items-center gap-3.5 sm:gap-4 bg-white border border-line rounded-[1.5rem] p-4 sm:p-5 elev-3d elev-3d-hover transition-colors duration-200 hover:border-accent/30">
              <span
                className="depth relative overflow-hidden w-12 h-12 sm:w-14 sm:h-14 rounded-2xl grid place-items-center text-accent-deep shrink-0 transition-colors duration-300 group-hover:text-white shadow-[inset_0_1px_0_rgba(255,255,255,.8),0_10px_20px_-10px_rgba(211,90,76,.45)]"
                style={{ background: "linear-gradient(150deg,#FDEDEA,#FFFFFF)" }}
              >
                <span className="hover-icon-bg absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "linear-gradient(150deg,#F4A597,#D35A4C)" }} aria-hidden />
                <span className="relative"><Icon /></span>
              </span>
              <div className="depth-sm min-w-0">
                <div className="font-semibold text-[14px] sm:text-[15px] leading-tight">{t(k)}</div>
                <div className="text-[12px] sm:text-[12.5px] text-muted mt-0.5 truncate">{t(s)}</div>
              </div>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
