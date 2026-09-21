"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { Photo } from "./Photo";
import { ArrowUpRight } from "./Icons";
import { useT } from "./LangProvider";

export type Slide = {
  kicker: string;
  top: string;
  accent: string;
  desc: string;
  img?: string;
  href: string;
};

const AUTO_MS = 5000;

// Content entrance — each element rises in with a staggered delay when its slide
// becomes active. Driven directly off the `on` boolean (no variant propagation),
// with initial={false} so the first slide is visible on paint (no LCP flash).
const ease: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
const rise = (on: boolean, delay: number) => ({
  initial: false as const,
  animate: { opacity: on ? 1 : 0, y: on ? 0 : 26 },
  transition: { duration: 0.6, ease, delay: on ? delay : 0 },
});

export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const paused = useRef(false);
  const t = useT();
  const canParallax = useRef(true);
  useEffect(() => { canParallax.current = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);

  const pause = (v: boolean) => { paused.current = v; setIsPaused(v); };

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: "smooth" });
  };

  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current) return;
      setActive(prev => {
        const next = (prev + 1) % slides.length;
        goTo(next);
        return next;
      });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0, bd = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const ch = c as HTMLElement;
      const cc = ch.offsetLeft + ch.offsetWidth / 2;
      const delta = cc - center;
      const d = Math.abs(delta);
      if (d < bd) { bd = d; best = i; }
      // Parallax: the image layer drifts opposite to the slide's scroll offset.
      // (Ken Burns scale lives on the inner .hero-ken layer, so they compose.)
      const wrap = imgRefs.current[i];
      if (wrap) wrap.style.transform = `translate3d(${canParallax.current ? delta * -0.05 : 0}px,0,0)`;
    });
    setActive(best);
  };

  return (
    <div>
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={() => pause(true)}
        onPointerUp={() => pause(false)}
        onMouseEnter={() => pause(true)}
        onMouseLeave={() => pause(false)}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-1 px-1 pb-1"
        style={{ scrollPadding: "0 4px" }}
      >
        {slides.map((s, i) => (
          <Link
            key={i}
            href={s.href}
            className="group snap-center shrink-0 w-full relative overflow-hidden rounded-[1.75rem] card-dark text-white grainy aspect-[16/11] sm:aspect-[5/2]"
          >
            {/* image layer (parallax) → inner Ken Burns layer → photo */}
            <div ref={el => { imgRefs.current[i] = el; }} className="absolute inset-0 will-change-transform">
              <div className="hero-ken">
                <Photo src={s.img} alt={`${s.top} ${s.accent}`} fallback={<div className="absolute inset-0"/>}
                  priority={i === 0} sizes="100vw"
                  imgClassName="absolute inset-0 w-full h-full object-cover"/>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-[#0B0C0D]/92 via-[#0B0C0D]/55 to-[#0B0C0D]/10"/>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0D]/70 via-transparent to-transparent"/>
            {/* accent glow — breathes, and lifts slightly on hover for depth */}
            <div className="absolute -left-16 -top-16 w-56 h-56 rounded-full bg-accent/40 blur-3xl animate-floaty transition-transform duration-700 group-hover:-translate-y-2"/>

            {(() => { const on = i === active; return (
            <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-9">
              <motion.span {...rise(on, 0.04)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-white/12 backdrop-blur text-[11px] font-semibold uppercase tracking-[.16em] w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"/> {s.kicker}
              </motion.span>
              <div>
                {/* leading ≥1: Cyrillic capitals carry marks above (Й, Ё) that
                    collide with the line above at tighter leading. */}
                <motion.h2 {...rise(on, 0.13)} className="font-display uppercase leading-[1.02] tracking-[.01em] text-[clamp(32px,8.5vw,68px)] [text-shadow:0_2px_24px_rgba(14,15,16,.35)]">
                  {s.top}<br/><span className="text-petal">{s.accent}</span>
                </motion.h2>
                <motion.p {...rise(on, 0.21)} className="text-white/70 text-[13px] mt-2 max-w-[260px]">{s.desc}</motion.p>
                <motion.span {...rise(on, 0.29)} className="inline-flex items-center gap-2.5 h-11 pl-5 pr-1.5 mt-5 rounded-pill bg-accent text-white text-[13px] font-semibold uppercase tracking-wide transition-transform duration-300 ease-spring group-hover:-translate-y-0.5">
                  {t("common.shopNow")}
                  <span className="w-8 h-8 rounded-full bg-white text-ink grid place-items-center transition-transform duration-300 ease-spring group-hover:translate-x-0.5 group-hover:-translate-y-0.5"><ArrowUpRight width={14} height={14}/></span>
                </motion.span>
              </div>
            </div>
            ); })()}
          </Link>
        ))}
      </div>

      {/* dots — the active one is a track the accent fills across the interval */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => { setActive(i); goTo(i); }}
            aria-label={`${t("a11y.slide")} ${i + 1}`}
            className="grid place-items-center h-6 w-6"
          >
            <span className={`relative block h-1.5 rounded-pill overflow-hidden transition-all duration-300 ease-elegant ${i === active ? "w-7 bg-ink/15" : "w-1.5 bg-ink/20 hover:bg-ink/35"}`}>
              {i === active && (
                <span
                  key={active}
                  className="absolute inset-y-0 left-0 rounded-pill bg-accent"
                  style={{ animation: `heroDot ${AUTO_MS}ms linear forwards`, animationPlayState: isPaused ? "paused" : "running" }}
                />
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
