"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Photo } from "@/components/Photo";
import { ProductVisual } from "@/components/ProductVisual";
import { ChevronLeft } from "@/components/Icons";
import type { Product } from "@/lib/types";

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const ease: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

// Directional crossfade+slide between images. `custom` carries the direction so
// a new image enters from the side you're heading toward. Reduced-motion is
// handled by MotionConfig (LangProvider) — framer settles to the end state.
const slideV = {
  enter: (d: number) => ({ opacity: 0, x: d >= 0 ? 42 : -42, scale: 1.02 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.42, ease } },
  exit: (d: number) => ({ opacity: 0, x: d >= 0 ? -32 : 32, scale: 1.01, transition: { duration: 0.3, ease } }),
};

// Main product image: switch images with a directional slide, cursor-tracking
// hover zoom (desktop) / tap-to-zoom (touch), prev-next arrows, a counter and
// keyboard arrows. The zoom transform lives on an inner layer so it composes
// with the framer slide on the outer layer.
export function Gallery({ product, img }: { product: Product; img: string }) {
  const imgs = product.images?.length ? product.images : [img];
  const many = imgs.length > 1;
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [canHover, setCanHover] = useState(true);
  useEffect(() => { setCanHover(window.matchMedia("(hover: hover)").matches); }, []);

  const current = imgs[index];
  const go = (next: number) => {
    const n = (next + imgs.length) % imgs.length;
    if (n === index) return;
    setDir(n > index ? 1 : -1);
    setIndex(n);
    setZoom(false);
  };

  function pointFromEvent(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  }
  const onMove = (e: React.MouseEvent) => { if (canHover) setPos(pointFromEvent(e)); };
  const onClick = (e: React.MouseEvent) => { if (canHover) return; setPos(pointFromEvent(e)); setZoom(z => !z); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!many) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  };

  return (
    <div className="flex flex-col-reverse lg:flex-row gap-3">
      {many && (
        <div className="flex lg:flex-col gap-2.5 overflow-x-auto no-scrollbar">
          {imgs.map((src, i) => (
            <button key={i} onClick={() => go(i)}
              aria-label={`${product.name} ${i + 1}`} aria-pressed={i === index}
              className={`relative w-16 h-16 lg:w-20 lg:h-20 shrink-0 rounded-xl overflow-hidden bg-graphite cursor-pointer ring-2 transition-all duration-200 ease-elegant active:scale-95 ${i === index ? "ring-accent scale-[1.03]" : "ring-transparent hover:ring-ink/30 hover:scale-[1.03] opacity-80 hover:opacity-100"}`}>
              <Photo src={src} alt={product.name}
                fallback={<div className="w-full h-full grid place-items-center card-dark"><ProductVisual product={product} size="sm"/></div>}
                imgClassName="w-full h-full object-cover"/>
            </button>
          ))}
        </div>
      )}

      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={product.name}
        onMouseEnter={() => canHover && setZoom(true)}
        onMouseLeave={() => canHover && setZoom(false)}
        onMouseMove={onMove}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="group flex-1 rounded-[1.5rem] aspect-[4/5] sm:aspect-square overflow-hidden bg-graphite relative cursor-zoom-in outline-none"
      >
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            variants={slideV}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0"
          >
            <div
              className="absolute inset-0"
              style={{
                transform: zoom ? "scale(1.9)" : "scale(1)",
                transformOrigin: `${pos.x}% ${pos.y}%`,
                transition: "transform 0.3s cubic-bezier(.22,.61,.36,1)",
              }}
            >
              <Photo src={current} alt={product.name} priority={index === 0}
                fallback={<div className="absolute inset-0 grid place-items-center card-dark"><ProductVisual product={product} size="lg"/></div>}
                imgClassName="absolute inset-0 w-full h-full object-cover"/>
            </div>
          </motion.div>
        </AnimatePresence>

        {product.badge && (
          <span className={`absolute top-4 left-4 z-10 text-[11px] uppercase tracking-[.14em] font-semibold px-3 h-7 rounded-pill grid place-items-center ${product.badge === "New" ? "bg-accent text-white" : "bg-white text-ink"}`}>{product.badge}</span>
        )}

        {many && (
          <>
            {/* prev / next — appear on hover (desktop), always tappable on touch */}
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); go(index - 1); }}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full grid place-items-center bg-white/85 backdrop-blur text-ink shadow-soft transition-all duration-200 ease-elegant hover:bg-white hover:scale-105 active:scale-90 opacity-0 group-hover:opacity-100 max-lg:opacity-100 focus-visible:opacity-100"
            >
              <ChevronLeft width={18} height={18}/>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); go(index + 1); }}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full grid place-items-center bg-white/85 backdrop-blur text-ink shadow-soft transition-all duration-200 ease-elegant hover:bg-white hover:scale-105 active:scale-90 opacity-0 group-hover:opacity-100 max-lg:opacity-100 focus-visible:opacity-100 rotate-180"
            >
              <ChevronLeft width={18} height={18}/>
            </button>

            {/* counter */}
            <span className="absolute bottom-4 right-4 z-10 num-tabular text-[11px] font-semibold tracking-wide px-2.5 h-7 rounded-pill grid place-items-center bg-ink/70 backdrop-blur text-white">
              {index + 1} / {imgs.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
