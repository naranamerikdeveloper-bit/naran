"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/LangProvider";

const TECH_TAGS = [
  ["Stretch", "shop.tStretch"], ["Thermal", "shop.tThermal"],
  ["Wicking", "shop.tWicking"], ["Water-repellent", "shop.tWater"],
] as const;

// Build a new URL from the current params, setting (or clearing) the given keys.
function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("page"); // any filter/sort change restarts at page 1
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
}

export function SortSelect() {
  const sp = useSearchParams();
  const t = useT();
  const setParams = useSetParams();
  return (
    <select
      value={sp.get("sort") ?? ""}
      onChange={(e) => setParams({ sort: e.target.value || null })}
      aria-label={t("shop.sort")}
      className="h-9 pl-3 pr-2 rounded-pill bg-surface-2 text-[13px] font-medium outline-none cursor-pointer border-none"
    >
      <option value="">{t("shop.sort")}</option>
      <option value="new">{t("shop.sortNew")}</option>
      <option value="price-asc">{t("shop.sortPriceAsc")}</option>
      <option value="price-desc">{t("shop.sortPriceDesc")}</option>
      <option value="rating">{t("shop.sortRating")}</option>
    </select>
  );
}

export function ShopFilters({ colors = [] }: { colors?: string[] }) {
  const sp = useSearchParams();
  const t = useT();
  const setParams = useSetParams();

  const activeColor = sp.get("color");
  const activeTech = sp.get("tech");
  const filtersActive = !!(activeColor || activeTech || sp.get("minPrice") || sp.get("maxPrice"));

  const [open, setOpen] = useState(filtersActive);
  const [min, setMin] = useState(sp.get("minPrice") ?? "");
  const [max, setMax] = useState(sp.get("maxPrice") ?? "");

  return (
    <details className="mt-3 group" open={open}>
      <summary
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
        className="list-none cursor-pointer inline-flex items-center gap-2 text-[13px] font-semibold text-ink bg-white border border-line rounded-pill px-4 h-10 shadow-soft"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        {t("shop.filters")}
        {filtersActive && <span className="w-1.5 h-1.5 rounded-full bg-accent"/>}
        <svg className="transition-transform group-open:rotate-180" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
      </summary>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-line rounded-2xl p-5 shadow-soft">
        {/* Price */}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t("shop.fPrice")}</div>
          <div className="flex items-center gap-2 mt-1">
            <input value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
              className="h-10 px-3 rounded-xl border border-line bg-surface-2 text-[13px] w-full" placeholder={t("shop.min")}/>
            <span className="text-subtle">—</span>
            <input value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
              className="h-10 px-3 rounded-xl border border-line bg-surface-2 text-[13px] w-full" placeholder={t("shop.max")}/>
            <button onClick={() => setParams({ minPrice: min || null, maxPrice: max || null })}
              className="btn btn-ghost btn-sm shrink-0">{t("common.apply")}</button>
          </div>
        </div>

        {/* Colour */}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t("common.colour")}</div>
          <div className="flex gap-2 flex-wrap mt-2">
            {colors.map(c => {
              const on = activeColor?.toLowerCase() === c.toLowerCase();
              return (
                <button key={c} onClick={() => setParams({ color: on ? null : c })}
                  aria-label={c} aria-pressed={on}
                  className="w-7 h-7 rounded-full border-2 border-white hover:scale-110 transition"
                  style={{ background: c, boxShadow: on ? "0 0 0 2px #0E0F10" : "0 0 0 1px rgba(14,15,16,.1)" }}/>
              );
            })}
          </div>
        </div>

        {/* Tech */}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t("shop.fTech")}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TECH_TAGS.map(([val, key]) => {
              const on = activeTech === val;
              return (
                <button key={val} onClick={() => setParams({ tech: on ? null : val })} aria-pressed={on}
                  className={`text-[12px] px-3 h-8 rounded-pill inline-flex items-center transition ${
                    on ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"
                  }`}>{t(key)}</button>
              );
            })}
          </div>
          {filtersActive && (
            <button onClick={() => { setMin(""); setMax(""); setParams({ color: null, tech: null, minPrice: null, maxPrice: null }); }}
              className="text-[12px] text-accent font-semibold mt-3 hover:underline">{t("shop.reset")}</button>
          )}
        </div>
      </div>
    </details>
  );
}
