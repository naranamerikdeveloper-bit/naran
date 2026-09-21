"use client";
import { useLang, setLang } from "./LangProvider";

export function LangToggle({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={`flex items-center bg-surface-2 rounded-pill p-0.5 text-[11px] font-semibold ${className}`}>
      <button
        onClick={() => lang !== "mn" && setLang("mn")}
        className={`px-2.5 h-7 rounded-pill transition ${lang === "mn" ? "bg-accent-deep text-white" : "text-muted"}`}
        aria-label="МН — Монгол хэл"
      >МН</button>
      <button
        onClick={() => lang !== "en" && setLang("en")}
        className={`px-2.5 h-7 rounded-pill transition ${lang === "en" ? "bg-accent-deep text-white" : "text-muted"}`}
        aria-label="EN — English"
      >EN</button>
    </div>
  );
}
