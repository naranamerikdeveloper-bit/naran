"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { SearchIcon } from "./Icons";
import { useT, useLang } from "./LangProvider";
import { money } from "@/lib/api";

type Hit = { id: string; slug: string; name: string; image?: string; price: number; sub: string };

/**
 * Header search with live suggestions: as the shopper types, matching products
 * drop down under the field (photo, name, type, price). ↑/↓ + Enter to pick,
 * Esc to close; Enter with nothing highlighted opens the full results page.
 */
export function SearchBox({ className = "", dropdownClassName = "" }: { className?: string; dropdownClassName?: string }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ items: Hit[]; total: number } | null>(null);
  const [active, setActive] = useState(-1);

  // Keep the field in sync with ?q= and close on navigation.
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get("q") ?? "");
    setOpen(false);
  }, [pathname]);

  // Debounced lookup (min 2 chars); stale responses are dropped.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    let live = true;
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .then(r => { if (live) { setRes(r); setActive(-1); } })
        .catch(() => { if (live) setRes({ items: [], total: 0 }); })
        .finally(() => { if (live) setLoading(false); });
    }, 220);
    return () => { live = false; clearTimeout(id); };
  }, [q]);

  // Click outside closes.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items = res?.items ?? [];
  const showAll = () => {
    const term = q.trim();
    setOpen(false);
    router.push(term ? `/${lang}/shop?q=${encodeURIComponent(term)}` : `/${lang}/shop`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(-1, i - 1)); }
    else if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) { setOpen(false); router.push(`/${lang}/product/${items[active].slug}`); }
      else showAll();
    }
  };

  const term = q.trim();
  const panel = open && term.length >= 2;

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <div className="flex items-center gap-2.5 h-11 px-4 rounded-pill bg-surface-2 border border-transparent focus-within:border-line focus-within:bg-white transition-colors">
        <button type="button" onClick={showAll} className="text-subtle hover:text-ink shrink-0 active:scale-90 transition" aria-label={t("nav.search")}>
          <SearchIcon width={16} height={16} />
        </button>
        <input value={q} data-search-input
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={panel} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t("nav.search")} placeholder={t("nav.searchShort")} enterKeyHint="search"
          className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none text-[14px] placeholder:text-subtle" />
        {q && (
          <button type="button" onClick={() => { setQ(""); setRes(null); }} aria-label={t("common.clear")}
            className="shrink-0 w-5 h-5 rounded-full bg-ink/10 text-ink/60 hover:bg-ink/20 grid place-items-center text-[13px] leading-none">×</button>
        )}
      </div>

      {panel && (
        <div id={listId} role="listbox"
          className={`absolute z-[60] top-full mt-2 rounded-2xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(10,10,11,.35)] overflow-hidden rise-in ${dropdownClassName || "left-0 right-0"}`}>
          {loading && !res ? (
            <div className="px-4 py-5 text-[13px] text-muted">{t("common.pleaseWait")}</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-5 text-[13px] text-muted">{t("search.none")} “{term}”</div>
          ) : (
            <>
              <ul className="max-h-[min(420px,60vh)] overflow-y-auto py-1.5">
                {items.map((p, i) => (
                  <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={active === i}>
                    <Link href={`/product/${p.slug}`} onClick={() => setOpen(false)} onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-3 px-3 py-2 mx-1.5 rounded-xl transition-colors ${active === i ? "bg-accent-soft/60" : "hover:bg-surface-2"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt="" loading="lazy" className="w-11 h-11 rounded-lg object-cover bg-surface-2 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink truncate">{p.name}</div>
                        <div className="text-[12px] text-muted truncate">{p.sub}</div>
                      </div>
                      <div className="text-[13px] font-semibold num-tabular shrink-0">{money(p.price)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={showAll}
                className="w-full flex items-center justify-between px-4 py-3 border-t border-line text-[13px] font-semibold text-ink hover:bg-surface-2 transition-colors">
                <span>{t("search.all")} {res && res.total > items.length ? `(${res.total})` : ""}</span>
                <span aria-hidden>→</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
