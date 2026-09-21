"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useT } from "@/components/LangProvider";
import { CountUp } from "@/components/CountUp";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

type Piece = { x: number; y: number; rot: number; color: string; size: number; delay: number };
const CONFETTI_COLORS = ["#AE6255", "#8F4B40", "#D7F26B", "#0E0F10", "#E8B4A8"];
function makeConfetti(): Piece[] {
  return Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 70 + Math.random() * 90;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 20,
      rot: Math.random() * 540 - 270,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 7,
      delay: Math.random() * 0.12,
    };
  });
}

// One-shot celebratory burst, generated client-side (no SSR/hydration mismatch).
function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => { setPieces(makeConfetti()); }, []);
  return (
    <div className="pointer-events-none absolute left-1/2 top-[120px] -translate-x-1/2 z-20" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: [1, 1, 0], x: p.x, y: [0, p.y, p.y + 40], scale: [0, 1, 1], rotate: p.rot }}
          transition={{ duration: 1.1, delay: 0.25 + p.delay, ease: "easeOut" }}
          style={{ position: "absolute", width: p.size, height: p.size * 0.5, background: p.color, borderRadius: 2 }}
        />
      ))}
    </div>
  );
}

function Success() {
  const t = useT();
  const params = useSearchParams();
  const id = params.get("id");
  const total = params.get("total");
  const eta = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

  return (
    <div
      className="min-h-screen grid place-items-center p-6"
      style={{
        background: `radial-gradient(1000px 500px at 20% -100px, #FFF0E6 0%, transparent 60%),
                     radial-gradient(700px 400px at 110% 110%, #F2F7E5 0%, transparent 60%), #F3F4EE`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="relative bg-white rounded-3xl p-10 max-w-[560px] w-full border border-border shadow-lift text-center overflow-hidden"
      >
        <Confetti />

        <Link href="/" className="relative z-10 flex items-center justify-center font-display text-[22px] tracking-[.04em]">
          NARAN
        </Link>

        {/* success mark: ring pulse + spring circle + drawn check */}
        <div className="relative my-8 mx-auto w-[92px] h-[92px] grid place-items-center">
          <motion.span
            className="absolute inset-0 rounded-full bg-accent/25"
            initial={{ scale: 0.6, opacity: 0.7 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 1, delay: 0.25, ease: "easeOut" }}
          />
          <motion.div
            className="relative w-[88px] h-[88px] rounded-full bg-ink grid place-items-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
          >
            <svg width="44" height="44" viewBox="0 0 52 52" fill="none">
              <motion.path
                d="M14 27 l8 8 l16 -18"
                stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.4, ease: EASE }}
              />
            </svg>
          </motion.div>
        </div>

        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5, ease: EASE }}
          className="relative z-10 font-display text-[28px] sm:text-[34px] uppercase tracking-tight leading-none mt-6 mb-3">{t("ok.title")}</motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52, duration: 0.5, ease: EASE }}
          className="relative z-10 text-muted text-[15px] leading-relaxed">{t("ok.desc")}</motion.p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
          className="relative z-10 bg-surface-2 rounded-xl p-5 my-7 text-left">
          <div className="flex justify-between mb-1.5"><span className="tiny">{t("ok.orderNo")}</span><span className="font-mono font-semibold">{id ?? "—"}</span></div>
          <div className="flex justify-between mb-1.5"><span className="tiny">{t("ok.eta")}</span><span className="font-medium">{eta}</span></div>
          <div className="flex justify-between"><span className="tiny">{t("ok.total")}</span><span className="font-medium num-tabular">{total ? <CountUp value={Number(total)} format={(n) => `₮${Math.round(n).toLocaleString("en-US")}`}/> : "—"}</span></div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.68, duration: 0.5, ease: EASE }}
          className="relative z-10 flex justify-center gap-2.5">
          <Link href="/account" className="btn btn-primary">{t("ok.viewOrders")}</Link>
          <Link href="/" className="btn btn-ghost">{t("ok.continue")}</Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function SuccessPage() {
  return <Suspense fallback={null}><Success /></Suspense>;
}
