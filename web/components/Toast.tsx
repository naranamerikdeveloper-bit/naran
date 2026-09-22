"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/lib/store";
import { CheckIcon } from "./Icons";

export function Toast() {
  const msg = useToast(s => s.msg);
  return (
    <>
      {/* Persistent polite live region so screen readers announce each toast
          (the visual toast below is aria-hidden to avoid a double announcement). */}
      <span role="status" aria-live="polite" className="sr-only">{msg}</span>
      <AnimatePresence>
        {msg && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+100px)] lg:bottom-7 left-1/2 -translate-x-1/2 z-[100] bg-ink text-white px-5 py-3.5 rounded-pill flex items-center gap-2.5 text-sm shadow-deep"
          >
            <CheckIcon width={16} height={16}/>
            <span>{msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
