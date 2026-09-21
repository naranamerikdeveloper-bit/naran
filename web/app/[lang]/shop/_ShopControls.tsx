"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useT } from "@/components/LangProvider";
import { TYPE_LABEL } from "@/lib/catalog";
import type { FacetCount } from "@/lib/types";

type Facets = { brands: FacetCount[]; types: FacetCount[]; newCount: number };

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
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

const listOf = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
const nf = (n: number) => new Intl.NumberFormat("mn-MN").format(n);

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
      <option value="name">{t("shop.sortName")}</option>
      <option value="brand">{t("shop.sortBrand")}</option>
    </select>
  );
}

export function ShopFilters({ facets }: { facets: Facets }) {
  const sp = useSearchParams();
  const t = useT();
  const setParams = useSetParams();

  const brands = listOf(sp.get("brand"));
  const types = listOf(sp.get("type"));
  const onlyNew = sp.get("filter") === "new";
  const minP = sp.get("minPrice"), maxP = sp.get("maxPrice");
  const activeCount = brands.length + types.length + (onlyNew ? 1 : 0) + (minP || maxP ? 1 : 0);

  const [open, setOpen] = useState(activeCount > 0);
  const [min, setMin] = useState(minP ?? "");
  const [max, setMax] = useState(maxP ?? "");
  const [q, setQ] = useState("");

  // Selected brands stay listed even when another filter zeroes their count.
  const brandRows = useMemo(() => {
    const m = new Map(facets.brands.map(b => [b.key, b.count]));
    brands.forEach(b => { if (!m.has(b)) m.set(b, 0); });
    const needle = q.trim().toLowerCase();
    return [...m].filter(([k]) => !needle || k.toLowerCase().includes(needle)).sort((a, b) => a[0].localeCompare(b[0]));
  }, [facets.brands, brands, q]);

  const clearAll = () => { setMin(""); setMax(""); setParams({ brand: null, type: null, filter: null, minPrice: null, maxPrice: null }); };
  const typeName = (k: string) => (k === "Set" ? t("type.Set") : TYPE_LABEL[k] || k);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink bg-white border border-line rounded-pill px-4 h-10 shadow-soft"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
          {t("shop.filters")}
          {activeCount > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] grid place-items-center num-tabular">{activeCount}</span>}
          <svg className={`transition-transform ${open ? "rotate-180" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>

        {/* Active filters as removable chips */}
        {brands.map(b => (
          <Chip key={`b-${b}`} onRemove={() => setParams({ brand: toggleIn(brands, b).join(",") || null })}>{b}</Chip>
        ))}
        {types.map(k => (
          <Chip key={`t-${k}`} onRemove={() => setParams({ type: toggleIn(types, k).join(",") || null })}>{typeName(k)}</Chip>
        ))}
        {onlyNew && <Chip onRemove={() => setParams({ filter: null })}>{t("shop.onlyNew")}</Chip>}
        {(minP || maxP) && (
          <Chip onRemove={() => { setMin(""); setMax(""); setParams({ minPrice: null, maxPrice: null }); }}>
            ₮{minP ? nf(Number(minP)) : "0"} – {maxP ? `₮${nf(Number(maxP))}` : "∞"}
          </Chip>
        )}
        {activeCount > 1 && (
          <button onClick={clearAll} className="text-[12px] text-accent font-semibold hover:underline px-1">{t("shop.clearAll")}</button>
        )}
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr] gap-5 bg-white border border-line rounded-2xl p-5 shadow-soft">
          {/* Brand */}
          <div className="min-w-0">
            <Label>{t("shop.fBrand")}</Label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.brandSearch")}
              className="h-9 px-3 mt-2 rounded-xl border border-line bg-surface-2 text-[13px] w-full outline-none focus:border-ink/30"/>
            <div className="mt-2 max-h-56 overflow-y-auto pr-1 -mr-1 space-y-0.5">
              {brandRows.length === 0 && <p className="text-[12px] text-subtle py-2">{t("shop.noBrand")}</p>}
              {brandRows.map(([b, count]) => {
                const on = brands.includes(b);
                return (
                  <label key={b} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-[13px] hover:bg-surface-2 ${count === 0 && !on ? "opacity-40" : ""}`}>
                    <input type="checkbox" checked={on} disabled={count === 0 && !on}
                      onChange={() => setParams({ brand: toggleIn(brands, b).join(",") || null })}
                      className="accent-[#0E0F10] w-4 h-4"/>
                    <span className="flex-1 truncate">{b}</span>
                    <span className="text-[11px] text-subtle num-tabular">{count}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Type + New */}
          <div>
            <Label>{t("shop.fType")}</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {facets.types.map(({ key, count }) => {
                const on = types.includes(key);
                return (
                  <button key={key} onClick={() => setParams({ type: toggleIn(types, key).join(",") || null })} aria-pressed={on}
                    className={`text-[12px] px-3 h-8 rounded-pill inline-flex items-center gap-1.5 transition ${
                      on ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>
                    {typeName(key)} <span className={`num-tabular ${on ? "opacity-70" : "text-subtle"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            {(facets.newCount > 0 || onlyNew) && (
              <label className="flex items-center gap-2.5 mt-4 text-[13px] cursor-pointer">
                <input type="checkbox" checked={onlyNew} onChange={() => setParams({ filter: onlyNew ? null : "new" })} className="accent-[#0E0F10] w-4 h-4"/>
                {t("shop.onlyNew")} <span className="text-[11px] text-subtle num-tabular">{facets.newCount}</span>
              </label>
            )}
          </div>

          {/* Price */}
          <div>
            <Label>{t("shop.fPrice")} (₮)</Label>
            <div className="flex items-center gap-2 mt-2">
              <input value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                className="h-10 px-3 rounded-xl border border-line bg-surface-2 text-[13px] w-full" placeholder={t("shop.min")}/>
              <span className="text-subtle">—</span>
              <input value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                className="h-10 px-3 rounded-xl border border-line bg-surface-2 text-[13px] w-full" placeholder={t("shop.max")}/>
            </div>
            <button onClick={() => setParams({ minPrice: min || null, maxPrice: max || null })}
              className="btn btn-dark btn-sm mt-2 w-full justify-center">{t("common.apply")}</button>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {([[0, 300000], [300000, 500000], [500000, 800000], [800000, 0]] as const).map(([lo, hi]) => (
                <button key={`${lo}-${hi}`}
                  onClick={() => { setMin(lo ? String(lo) : ""); setMax(hi ? String(hi) : ""); setParams({ minPrice: lo ? String(lo) : null, maxPrice: hi ? String(hi) : null }); }}
                  className="text-[11.5px] px-2.5 h-7 rounded-pill bg-surface-2 text-muted hover:text-ink num-tabular">
                  {lo ? `₮${lo / 1000}k` : "₮0"}–{hi ? `₮${hi / 1000}k` : "+"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{children}</div>;
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-pill bg-ink text-white text-[12px] font-medium">
      {children}
      <button onClick={onRemove} aria-label="Remove" className="w-5 h-5 rounded-full grid place-items-center hover:bg-white/20">×</button>
    </span>
  );
}
