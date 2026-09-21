"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { motion } from "framer-motion";
import { useT } from "@/components/LangProvider";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

// Rendered whenever notFound() is called inside the [lang] segment (e.g. an
// unknown product slug). Branded, bilingual, elegant — a proper 404.
export default function NotFound() {
  const t = useT();
  return (
    <div className="relative min-h-screen grid place-items-center px-6 py-16 mesh-light text-center overflow-hidden">
      {/* warm ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] max-w-[90vw] rounded-full bg-accent/10 blur-3xl" />

      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
      >
        <span className="font-display uppercase text-[20px] tracking-[.14em] text-accent">NARAN</span>

        <motion.p
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.75, delay: 0.06, ease: EASE }}
          className="mt-5 font-display font-black leading-[.82] tracking-tight text-transparent bg-clip-text"
          style={{ fontSize: "clamp(120px, 26vw, 248px)", backgroundImage: "linear-gradient(158deg,#0E0F10 0%,#5C5F63 100%)" }}
        >404</motion.p>

        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18, ease: EASE }}
          className="hd-2 !text-[26px] sm:!text-[30px] mt-2">{t("nf.title")}</motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24, ease: EASE }}
          className="mt-3 text-[14px] text-muted max-w-[380px] mx-auto">{t("nf.desc")}</motion.p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn btn-outline">{t("nf.home")}</Link>
          <Link href="/shop" className="btn btn-ghost">{t("nf.shop")}</Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
