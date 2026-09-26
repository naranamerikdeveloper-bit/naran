import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ShoppingBag, MagnifyingGlass, XMark } from "@medusajs/icons";
import { Button, Input, Select, Badge, toast } from "@medusajs/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { tug, PAY_LABEL, printReceipt, type Receipt } from "../../lib/receipt";

/**
 * NARAN POS — a full-screen point-of-sale for the shop floor.
 *
 * It deliberately covers the admin chrome (fixed inset-0) so a cashier sees one
 * focused screen: catalog on the left, running ticket on the right. The whole
 * published catalog is loaded once and filtered client-side, so search and
 * category switching are instant with no round-trips between customers.
 */

type Variant = { id: string; title: string; sku: string; price: number; manage: boolean; stock: number | null };
type Category = { id: string; name: string; handle: string };
type Product = { id: string; title: string; thumbnail: string; brand: string; gender: string; categories: Category[]; variants: Variant[] };
// `max` = stock cap (null = unlimited / not tracked).
type Line = { variant_id: string; title: string; unit_price: number; quantity: number; max: number | null };

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Request failed (${res.status})`);
  return res.json();
}

const PAYMENTS = Object.entries(PAY_LABEL).map(([value, label]) => ({ value, label }));

// Audience chips (mirrors the storefront's Эр/Эм/Юнисекс/Бэлгийн багц).
const AUDIENCES: { key: string; label: string }[] = [
  { key: "all", label: "Бүгд" },
  { key: "Women", label: "Эмэгтэй" },
  { key: "Men", label: "Эрэгтэй" },
  { key: "Unisex", label: "Юнисекс" },
];

const stockOf = (v: Variant) => (v.manage ? (v.stock ?? 0) : null);
const isOut = (v: Variant) => v.manage && (v.stock ?? 0) <= 0;

const OfflineSalePage = () => {
  const { loading: permLoading, can } = usePermissions();
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [audience, setAudience] = useState("all");
  // Which variant each multi-variant card is currently pointing at.
  const [pick, setPick] = useState<Record<string, string>>({});

  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cash, setCash] = useState("");
  const [discMode, setDiscMode] = useState<"pct" | "amt">("pct");
  const [discVal, setDiscVal] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<Receipt | null>(null);
  const [today, setToday] = useState<{ count: number; total: number } | null>(null);

  const loadSummary = () => adminFetch("/offline-sale?summary=1").then(r => setToday(r.summary)).catch(() => {});
  const loadProducts = () =>
    adminFetch("/offline-sale")
      .then(r => setProducts(r.products || []))
      .catch(() => toast.error("Бараа ачаалж чадсангүй"))
      .finally(() => setLoading(false));

  useEffect(() => { loadSummary(); loadProducts(); }, []);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Categories that actually have products, with live counts.
  const categories = useMemo(() => {
    const m = new Map<string, { handle: string; name: string; n: number }>();
    for (const p of products) {
      for (const c of p.categories || []) {
        const e = m.get(c.handle) || { handle: c.handle, name: c.name, n: 0 };
        e.n++; m.set(c.handle, e);
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [products]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(p => {
      if (cat !== "all" && !(p.categories || []).some(c => c.handle === cat)) return false;
      if (audience !== "all" && p.gender !== audience) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        (p.brand || "").toLowerCase().includes(needle) ||
        p.variants.some(v => (v.sku || "").toLowerCase().includes(needle))
      );
    });
  }, [products, q, cat, audience]);

  if (!permLoading && !can("orders.write")) {
    return <AccessDenied title="Кассын систем (POS)" perm="orders.write" />;
  }

  const activeVariant = (p: Product): Variant => {
    const chosen = p.variants.find(v => v.id === pick[p.id]);
    return chosen || p.variants.find(v => !isOut(v)) || p.variants[0];
  };
  const qtyInCart = (variantId?: string) => lines.find(l => l.variant_id === variantId)?.quantity ?? 0;

  const addVariant = (p: Product, v: Variant) => {
    if (isOut(v)) { toast.error(`${p.title} — үлдэгдэлгүй байна.`); return; }
    setLines(prev => {
      const found = prev.find(l => l.variant_id === v.id);
      if (found) {
        if (found.max != null && found.quantity >= found.max) { toast.error(`Зөвхөн ${found.max} ширхэг үлдсэн.`); return prev; }
        return prev.map(l => l.variant_id === v.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, {
        variant_id: v.id,
        title: `${p.title}${v.title && v.title !== p.title ? ` · ${v.title}` : ""}`,
        unit_price: v.price, quantity: 1, max: v.manage ? (v.stock ?? 0) : null,
      }];
    });
  };
  const setLine = (id: string, patch: Partial<Line>) => setLines(prev => prev.map(l => l.variant_id === id ? { ...l, ...patch } : l));
  const decVariant = (variantId: string) =>
    setLines(prev => prev.flatMap(l => l.variant_id !== variantId ? [l] : l.quantity <= 1 ? [] : [{ ...l, quantity: l.quantity - 1 }]));
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.variant_id !== id));

  // Enter in search adds the first in-stock result — fast scanner/keyboard flow.
  const addTopResult = () => {
    for (const p of visible) {
      const v = p.variants.find(x => !isOut(x));
      if (v) { addVariant(p, v); return; }
    }
    if (q.trim()) toast.error("Нэмэх боломжтой бараа олдсонгүй.");
  };

  const subtotal = lines.reduce((a, l) => a + l.unit_price * l.quantity, 0);
  const count = lines.reduce((a, l) => a + l.quantity, 0);
  const discNum = Math.max(0, Math.round(Number(discVal) || 0));
  const discount = Math.min(subtotal, discMode === "pct" ? Math.round(subtotal * Math.min(100, discNum) / 100) : discNum);
  const total = subtotal - discount;
  const cashNum = Math.max(0, Math.round(Number(cash) || 0));
  const change = paymentMethod === "cash" && cash !== "" ? cashNum - total : null;
  const cashShort = paymentMethod === "cash" && cash !== "" && cashNum < total;

  async function submit() {
    if (!lines.length) { toast.error("Дор хаяж нэг бараа сонгоно уу."); return; }
    if (cashShort) { toast.error("Авсан бэлэн мөнгө нийт дүнгээс бага байна."); return; }
    setSaving(true);
    try {
      const r = await adminFetch("/offline-sale", {
        method: "POST",
        body: JSON.stringify({
          items: lines.map(l => ({ variant_id: l.variant_id, quantity: l.quantity, title: l.title, unit_price: l.unit_price })),
          customerName: customerName.trim() || undefined,
          phone: phone.trim() || undefined,
          paymentMethod,
          discount: discount || undefined,
          note: note.trim() || undefined,
        }),
      });
      const no = r.display_id ? `NT-${r.display_id}` : (r.id || "");
      const receipt: Receipt = {
        ...(r.receipt || { items: [], total: r.total ?? total, paymentMethod, customerName: customerName.trim() || null, at: new Date().toISOString() }),
        no, paid: !!r.paid,
        ...(paymentMethod === "cash" && cash !== "" ? { cash: cashNum, change: cashNum - (r.total ?? total) } : {}),
      };
      setLast(receipt);
      toast.success(`Борлуулалт бүртгэгдлээ (${no}) · ${tug(r.total ?? total)}`);
      setLines([]); setCustomerName(""); setPhone(""); setNote(""); setPaymentMethod("cash"); setCash(""); setDiscVal("");
      loadSummary();
      loadProducts(); // refresh stock after the sale
    } catch (e: any) {
      toast.error(e?.message || "Борлуулалт бүртгэхэд алдаа гарлаа");
    } finally { setSaving(false); }
  }

  return (
    // Full-screen: the cashier sees only the POS, never the admin chrome.
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FBF7F8] text-ui-fg-base">
      {/* ---------- Top bar ---------- */}
      <header className="flex shrink-0 items-center gap-4 border-b border-ui-border-base bg-white px-5 py-3">
        <div className="shrink-0">
          <div className="text-[19px] font-semibold leading-none tracking-tight text-ui-fg-base">NARAN <span className="text-ui-tag-red-icon">POS</span></div>
          <div className="mt-1 text-[11px] uppercase tracking-[.16em] text-ui-fg-muted">Кассын систем</div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted"><MagnifyingGlass /></span>
          <input
            ref={searchRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTopResult(); } }}
            placeholder="Нэр, брэнд эсвэл SKU-гаар хайх…  (Enter — эхнийг нэмэх)"
            className="h-11 w-full rounded-full border border-ui-border-base bg-ui-bg-subtle pl-10 pr-4 text-sm outline-none transition focus:border-ui-fg-interactive focus:bg-white"
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {today && (
            <div className="hidden text-right sm:block">
              <div className="text-[11px] uppercase tracking-wide text-ui-fg-muted">Өнөөдөр</div>
              <div className="text-sm font-semibold tabular-nums">{today.count} зарлага · {tug(today.total)}</div>
            </div>
          )}
          <a href="/app" className="rounded-lg border border-ui-border-base bg-white px-3 py-2 text-[13px] font-medium hover:bg-ui-bg-subtle">Админ</a>
        </div>
      </header>

      {/* ---------- Body: catalog + ticket ---------- */}
      <div className="flex min-h-0 flex-1">
        {/* Catalog */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Category cards */}
          <div className="flex shrink-0 gap-3 overflow-x-auto px-5 pt-4 pb-1">
            <CatCard active={cat === "all"} onClick={() => setCat("all")} name="Бүгд" n={products.length} />
            {categories.map(c => (
              <CatCard key={c.handle} active={cat === c.handle} onClick={() => setCat(c.handle)} name={c.name} n={c.n} />
            ))}
          </div>

          {/* Audience chips */}
          <div className="flex shrink-0 flex-wrap gap-2 px-5 py-3">
            {AUDIENCES.map(a => (
              <button key={a.key} type="button" onClick={() => setAudience(a.key)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                  audience === a.key ? "bg-ui-tag-red-bg text-ui-tag-red-text" : "bg-white text-ui-fg-subtle hover:bg-ui-bg-subtle border border-ui-border-base"
                }`}>{a.label}</button>
            ))}
            <span className="ml-auto self-center text-[12px] text-ui-fg-muted tabular-nums">{visible.length} бараа</span>
          </div>

          {/* Product grid */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            {loading ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[168px] animate-pulse rounded-2xl bg-ui-bg-component" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="grid place-items-center py-24 text-center">
                <div className="text-sm font-medium">Бараа олдсонгүй</div>
                <div className="mt-1 text-[13px] text-ui-fg-subtle">Хайлт эсвэл шүүлтүүрээ өөрчилж үзнэ үү.</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
                {visible.map(p => {
                  const v = activeVariant(p);
                  if (!v) return null;
                  const out = isOut(v);
                  const inCart = qtyInCart(v.id);
                  const left = stockOf(v);
                  return (
                    <div key={p.id}
                      className={`flex flex-col rounded-2xl border bg-white p-3 transition ${out ? "border-ui-border-base opacity-60" : "border-ui-border-base hover:shadow-elevation-card-hover"}`}>
                      <div className="flex gap-3">
                        {p.thumbnail
                          ? <img src={p.thumbnail} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl bg-ui-bg-subtle object-cover" />
                          : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-ui-bg-subtle text-ui-fg-muted"><ShoppingBag /></div>}
                        <div className="min-w-0 flex-1">
                          {p.brand && <div className="truncate text-[10px] font-semibold uppercase tracking-[.12em] text-ui-tag-red-icon">{p.brand}</div>}
                          <div className="line-clamp-2 text-[13.5px] font-medium leading-snug">{p.title}</div>
                          {v.sku && <div className="mt-0.5 truncate font-mono text-[10.5px] text-ui-fg-muted">{v.sku}</div>}
                        </div>
                      </div>

                      {/* Size / variant chips (only when there's a real choice) */}
                      {p.variants.length > 1 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {p.variants.map(x => (
                            <button key={x.id} type="button" disabled={isOut(x)}
                              onClick={() => setPick(prev => ({ ...prev, [p.id]: x.id }))}
                              className={`rounded-md px-2 py-1 text-[11px] transition ${
                                isOut(x) ? "cursor-not-allowed bg-ui-bg-disabled text-ui-fg-muted line-through"
                                : x.id === v.id ? "bg-ui-bg-base-pressed font-semibold" : "bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover"
                              }`}>{x.title}</button>
                          ))}
                        </div>
                      )}

                      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                        <div>
                          <div className="text-[15px] font-semibold tabular-nums">{tug(v.price)}</div>
                          {out ? (
                            <Badge size="2xsmall" color="red">Дууссан</Badge>
                          ) : left == null ? (
                            <span className="text-[11px] text-ui-fg-muted">Хязгааргүй</span>
                          ) : (
                            <span className={`text-[11px] tabular-nums ${left <= 5 ? "text-ui-tag-orange-text" : "text-ui-fg-muted"}`}>{left} ширхэг</span>
                          )}
                        </div>
                        {out ? (
                          <span className="text-[11px] font-medium text-ui-fg-muted">Сагслах боломжгүй</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => decVariant(v.id)} disabled={!inCart}
                              className="grid h-8 w-8 place-items-center rounded-full border border-ui-border-base bg-white text-lg leading-none disabled:opacity-40">−</button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">{inCart}</span>
                            <button type="button" onClick={() => addVariant(p, v)}
                              className="grid h-8 w-8 place-items-center rounded-full bg-ui-tag-red-icon text-lg leading-none text-white transition hover:opacity-90">+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ---------- Ticket / payment ---------- */}
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-ui-border-base bg-white 2xl:w-[420px]">
          <div className="flex items-center justify-between border-b border-ui-border-base px-5 py-4">
            <div>
              <div className="text-[17px] font-semibold">Төлбөр</div>
              <div className="mt-0.5 text-[12px] text-ui-fg-muted">{new Date().toLocaleDateString("mn-MN")}</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] text-ui-fg-muted">Сонгосон</div>
              <div className="text-[15px] font-semibold tabular-nums">{count} ширхэг</div>
            </div>
          </div>

          {/* Lines */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {lines.length === 0 ? (
              <div className="grid place-items-center py-16 text-center">
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-ui-bg-component text-ui-fg-muted"><ShoppingBag /></div>
                <div className="text-sm font-medium">Сагс хоосон байна</div>
                <div className="mt-1 text-[12.5px] text-ui-fg-subtle">Зүүн талаас бараа сонгоно уу.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map(l => (
                  <div key={l.variant_id} className="rounded-xl border border-ui-border-base p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{l.title}</div>
                      <button type="button" onClick={() => removeLine(l.variant_id)} aria-label="Хасах"
                        className="shrink-0 text-ui-fg-muted hover:text-ui-fg-error"><XMark /></button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => decVariant(l.variant_id)}
                          className="grid h-7 w-7 place-items-center rounded-full border border-ui-border-base">−</button>
                        <input type="number" min={1} max={l.max ?? undefined} value={l.quantity}
                          onChange={e => {
                            const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                            if (l.max != null && n > l.max) { toast.error(`Зөвхөн ${l.max} ширхэг үлдсэн.`); setLine(l.variant_id, { quantity: l.max }); return; }
                            setLine(l.variant_id, { quantity: n });
                          }}
                          className="h-7 w-11 rounded border border-ui-border-base bg-ui-bg-field text-center text-[13px] tabular-nums outline-none focus:border-ui-fg-interactive" />
                        <button type="button" onClick={() => setLine(l.variant_id, { quantity: l.max != null ? Math.min(l.max, l.quantity + 1) : l.quantity + 1 })}
                          disabled={l.max != null && l.quantity >= l.max}
                          className="grid h-7 w-7 place-items-center rounded-full border border-ui-border-base disabled:opacity-40">+</button>
                      </div>
                      <div className="text-[14px] font-semibold tabular-nums">{tug(l.unit_price * l.quantity)}</div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setLines([])}
                  className="self-end px-1 py-1 text-[12px] text-ui-fg-muted hover:text-ui-fg-base">Сагс цэвэрлэх</button>
              </div>
            )}
          </div>

          {/* Totals + payment */}
          <div className="shrink-0 border-t border-ui-border-base px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="shrink-0 text-[12.5px] font-medium text-ui-fg-subtle">Хямдрал</span>
              <Input inputMode="numeric" value={discVal} onChange={e => setDiscVal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" size="small" className="flex-1" />
              <div className="flex overflow-hidden rounded-md border border-ui-border-base">
                {(["pct", "amt"] as const).map(m => (
                  <button key={m} type="button" onClick={() => setDiscMode(m)}
                    className={`px-2.5 py-1 text-[12px] ${discMode === m ? "bg-ui-bg-base-pressed font-medium" : "bg-ui-bg-subtle text-ui-fg-muted"}`}>{m === "pct" ? "%" : "₮"}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-[13px]">
              <Row label="Дүн" value={tug(subtotal)} />
              {discount > 0 && <Row label="Хямдрал" value={`−${tug(discount)}`} tone="red" />}
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-[15px] font-semibold">Нийт</span>
                <span className="text-[20px] font-semibold tabular-nums">{tug(total)}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Харилцагч (заавал биш)" size="small" />
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Утас" size="small" />
            </div>

            <div className="mt-2">
              <Select value={paymentMethod} onValueChange={setPaymentMethod} size="small">
                <Select.Trigger><Select.Value placeholder="Төлбөрийн хэлбэр" /></Select.Trigger>
                <Select.Content>
                  {PAYMENTS.map(p => <Select.Item key={p.value} value={p.value}>{p.label}</Select.Item>)}
                </Select.Content>
              </Select>
            </div>

            {paymentMethod === "cash" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Input inputMode="numeric" value={cash} onChange={e => setCash(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Авсан мөнгө" size="small" />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {[total, 20000, 50000, 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => (
                      <button key={v} type="button" onClick={() => setCash(String(v))}
                        className="rounded bg-ui-bg-subtle px-1.5 py-0.5 text-[11px] hover:bg-ui-bg-subtle-hover">{v === total ? "Яг таг" : tug(v)}</button>
                    ))}
                  </div>
                </div>
                <div className={`grid h-9 place-items-center rounded-lg px-2 text-[14px] font-semibold tabular-nums ${
                  cashShort ? "bg-ui-tag-red-bg text-ui-tag-red-text" : "bg-ui-tag-green-bg text-ui-tag-green-text"
                }`}>
                  {cash === "" ? "Хариулт —" : cashShort ? `Дутуу ${tug(total - cashNum)}` : `Хариулт ${tug(change ?? 0)}`}
                </div>
              </div>
            )}

            <Button variant="primary" className="mt-3 h-11 w-full" onClick={submit}
              disabled={saving || !lines.length || cashShort} isLoading={saving}>
              {lines.length ? `Төлбөр авах · ${tug(total)}` : "Төлбөр авах"}
            </Button>

            {last && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-ui-bg-subtle px-3 py-2">
                <span className="text-[12px]">Сүүлд: <b>{last.no}</b> · {tug(last.total)}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => printReceipt(last)} className="text-[12px] font-medium text-ui-fg-interactive">Баримт</button>
                  <button type="button" onClick={() => setLast(null)} className="text-[12px] text-ui-fg-muted">Хаах</button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

function CatCard({ name, n, active, onClick }: { name: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 rounded-2xl border px-4 py-3 text-left transition ${
        active ? "border-transparent bg-ui-tag-red-icon text-white" : "border-ui-border-base bg-white hover:bg-ui-bg-subtle"
      }`}>
      <div className="text-[13.5px] font-semibold leading-none">{name}</div>
      <div className={`mt-1.5 text-[11.5px] tabular-nums ${active ? "text-white/80" : "text-ui-fg-muted"}`}>{n} бараа</div>
    </button>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ui-fg-subtle">{label}</span>
      <span className={`tabular-nums ${tone === "red" ? "text-ui-tag-red-text" : ""}`}>{value}</span>
    </div>
  );
}

export const config = defineRouteConfig({
  label: "Кассын систем (POS)",
  icon: ShoppingBag,
});

export default OfflineSalePage;
