import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ShoppingBag, MagnifyingGlass, XMark } from "@medusajs/icons";
import { Button, Input, toast } from "@medusajs/ui";
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
 *
 * Styling uses the NARAN brand palette inline (the admin's Tailwind only ships
 * Medusa's own tokens), with Medusa's semantic tag colours kept for stock state.
 */

// NARAN brand — same warm coral/orange as the storefront and the login screen.
const BRAND = {
  grad: "linear-gradient(135deg,#F4A597 0%,#D35A4C 100%)",
  accent: "#E76F61",
  deep: "#D35A4C",
  soft: "#FDEDEA",
  page: "#FDF8F6",
};

const Sun = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.2" fill="#fff" stroke="none" />
    <path d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5" />
  </svg>
);

type Variant = { id: string; title: string; sku: string; price: number; manage: boolean; stock: number | null };
type Category = { id: string; name: string; handle: string };
type Product = { id: string; title: string; thumbnail: string; brand: string; gender: string; categories: Category[]; variants: Variant[] };
// `max` = stock cap (null = unlimited / not tracked).
type Line = { variant_id: string; title: string; unit_price: number; quantity: number; max: number | null };
type BankUrl = { name?: string; description?: string; logo?: string; link: string };
type QpayInvoice = { invoiceId: string; qrText: string; qrImage: string; shortUrl: string; urls: BankUrl[]; amount: number };

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Request failed (${res.status})`);
  return res.json();
}

// Payment methods as visible choices (not a dropdown) — a cashier picks one at a
// glance, and QPay is impossible to miss.
const PAYMENTS: { value: string; label: string; icon: string }[] = [
  { value: "cash", label: PAY_LABEL.cash, icon: "₮" },
  { value: "qpay", label: PAY_LABEL.qpay, icon: "QR" },
  { value: "card", label: PAY_LABEL.card, icon: "▭" },
  { value: "transfer", label: PAY_LABEL.transfer, icon: "⇄" },
];

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
  const qpayDoneRef = useRef(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [audience, setAudience] = useState("all");
  const [pick, setPick] = useState<Record<string, string>>({});

  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cash, setCash] = useState("");
  const [discMode, setDiscMode] = useState<"pct" | "amt">("pct");
  const [discVal, setDiscVal] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; type: string; value: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qpay, setQpay] = useState<QpayInvoice | null>(null);
  const [qpayStatus, setQpayStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [qpayBusy, setQpayBusy] = useState(false);
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

  // Watch the QPay invoice; the sale is recorded the moment it reports paid.
  useEffect(() => {
    if (!qpay || qpayStatus !== "pending") return;
    let stop = false;
    const timer = setInterval(async () => {
      if (stop) return;
      try {
        const s = await adminFetch(`/offline-sale/qpay?invoiceId=${encodeURIComponent(qpay.invoiceId)}`);
        if (stop) return;
        if (s.status === "paid") {
          stop = true; clearInterval(timer);
          if (!qpayDoneRef.current) {
            qpayDoneRef.current = true;
            await submit(qpay.invoiceId);
            setQpay(null);
          }
        } else if (s.status === "failed") {
          stop = true; clearInterval(timer);
          setQpayStatus("failed");
        }
      } catch { /* transient network blip — keep polling */ }
    }, 2500);
    return () => { stop = true; clearInterval(timer); };
  }, [qpay, qpayStatus]);

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
  const manualDisc = discMode === "pct" ? Math.round(subtotal * Math.min(100, discNum) / 100) : discNum;
  const codeDisc = applied
    ? applied.type === "percentage"
      ? Math.round((subtotal * Math.min(100, applied.value)) / 100)
      : Math.round(applied.value)
    : 0;
  const discount = Math.min(subtotal, manualDisc + codeDisc);
  const total = subtotal - discount;
  const cashNum = Math.max(0, Math.round(Number(cash) || 0));
  const change = paymentMethod === "cash" && cash !== "" ? cashNum - total : null;
  const cashShort = paymentMethod === "cash" && cash !== "" && cashNum < total;

  const cancelQpay = () => { setQpay(null); setQpayStatus("pending"); };
  const qrSrc = qpay?.qrImage
    ? (/^(data:|https?:)/i.test(qpay.qrImage) ? qpay.qrImage : `data:image/png;base64,${qpay.qrImage}`)
    : "";

  const startQpay = async () => {
    if (!lines.length) { toast.error("Дор хаяж нэг бараа сонгоно уу."); return; }
    setQpayBusy(true);
    try {
      const r = await adminFetch("/offline-sale/qpay", {
        method: "POST",
        body: JSON.stringify({
          items: lines.map(l => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit_price })),
          discount: discount || undefined,
        }),
      });
      qpayDoneRef.current = false;
      setQpay({ ...r.invoice, amount: r.amount });
      setQpayStatus("pending");
    } catch (e: any) {
      toast.error(e?.message || "QPay эхлүүлж чадсангүй");
    } finally {
      setQpayBusy(false);
    }
  };

  const applyCode = async () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    if (!subtotal) { toast.error("Эхлээд бараа сонгоно уу."); return; }
    setChecking(true);
    try {
      const r = await adminFetch("/marketing/validate-code", { method: "POST", body: JSON.stringify({ code: c, subtotal }) });
      setApplied({ code: r.code, type: r.type, value: Number(r.value) });
      setCodeInput("");
      toast.success(`${r.code} код хэрэглэгдлээ`);
    } catch (e: any) {
      toast.error(e?.message || "Код буруу байна");
    } finally {
      setChecking(false);
    }
  };

  async function submit(qpayInvoiceId?: string) {
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
          discountCode: applied?.code || undefined,
          qpayInvoiceId,
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
      setLines([]); setCustomerName(""); setPhone(""); setPaymentMethod("cash"); setCash(""); setDiscVal("");
      setApplied(null); setCodeInput("");
      loadSummary();
      loadProducts();
    } catch (e: any) {
      toast.error(e?.message || "Борлуулалт бүртгэхэд алдаа гарлаа");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col text-ui-fg-base" style={{ background: BRAND.page }}>
      {/* ---------- Top bar ---------- */}
      <header className="flex shrink-0 items-center gap-4 border-b border-ui-border-base bg-white px-5 py-3">
        <div className="flex shrink-0 items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl shadow-[0_10px_22px_-8px_rgba(211,90,76,.55)]" style={{ background: BRAND.grad }}>
            <Sun />
          </span>
          <div>
            <div className="text-[18px] font-semibold leading-none tracking-tight">
              NARAN <span style={{ color: BRAND.deep }}>POS</span>
            </div>
            <div className="mt-1 text-[10.5px] uppercase tracking-[.18em] text-ui-fg-muted">Кассын систем</div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-2xl">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ui-fg-muted"><MagnifyingGlass /></span>
          <input
            ref={searchRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTopResult(); } }}
            placeholder="Нэр, брэнд эсвэл SKU-гаар хайх…   (Enter — эхнийг нэмэх)"
            className="h-12 w-full rounded-full border border-ui-border-base bg-[#FBF6F4] pl-11 pr-4 text-[14px] outline-none transition focus:border-[#E76F61] focus:bg-white focus:shadow-[0_0_0_4px_rgba(231,111,97,.12)]"
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {today && (
            <div className="hidden rounded-xl px-3.5 py-2 text-right lg:block" style={{ background: BRAND.soft }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: BRAND.deep }}>Өнөөдөр</div>
              <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: BRAND.deep }}>
                {today.count} зарлага · {tug(today.total)}
              </div>
            </div>
          )}
          <a href="/app" className="rounded-xl border border-ui-border-base bg-white px-3.5 py-2.5 text-[13px] font-medium hover:bg-ui-bg-subtle">Админ</a>
        </div>
      </header>

      {/* ---------- Body ---------- */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Category cards */}
          <div className="flex shrink-0 gap-2.5 overflow-x-auto px-5 pt-4 pb-1">
            <CatCard active={cat === "all"} onClick={() => setCat("all")} name="Бүгд" n={products.length} />
            {categories.map(c => (
              <CatCard key={c.handle} active={cat === c.handle} onClick={() => setCat(c.handle)} name={c.name} n={c.n} />
            ))}
          </div>

          {/* Audience chips */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 py-3">
            {AUDIENCES.map(a => {
              const on = audience === a.key;
              return (
                <button key={a.key} type="button" onClick={() => setAudience(a.key)}
                  className="rounded-full border px-4 py-1.5 text-[13px] font-medium transition"
                  style={on
                    ? { background: BRAND.soft, color: BRAND.deep, borderColor: BRAND.accent }
                    : { background: "#fff", color: "#6B7280", borderColor: "rgba(0,0,0,.08)" }}>
                  {a.label}
                </button>
              );
            })}
            <span className="ml-auto text-[12px] tabular-nums text-ui-fg-muted">{visible.length} бараа</span>
          </div>

          {/* Product grid */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            {loading ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[190px] animate-pulse rounded-2xl bg-white/70" />)}
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
                      className={`flex flex-col rounded-2xl border bg-white p-3.5 transition ${out ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-20px_rgba(211,90,76,.5)]"}`}
                      style={{ borderColor: inCart ? BRAND.accent : "rgba(0,0,0,.07)" }}>
                      <div className="flex gap-3">
                        {p.thumbnail
                          ? <img src={p.thumbnail} alt="" loading="lazy" className="h-[62px] w-[62px] shrink-0 rounded-xl object-cover" style={{ background: BRAND.soft }} />
                          : <div className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-xl text-ui-fg-muted" style={{ background: BRAND.soft }}><ShoppingBag /></div>}
                        <div className="min-w-0 flex-1">
                          {p.brand && <div className="truncate text-[9.5px] font-bold uppercase tracking-[.14em]" style={{ color: BRAND.accent }}>{p.brand}</div>}
                          <div className="line-clamp-2 text-[13.5px] font-medium leading-snug">{p.title}</div>
                          {v.sku && <div className="mt-0.5 truncate font-mono text-[10px] text-ui-fg-muted">{v.sku}</div>}
                        </div>
                      </div>

                      {p.variants.length > 1 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {p.variants.map(x => {
                            const on = x.id === v.id;
                            return (
                              <button key={x.id} type="button" disabled={isOut(x)}
                                onClick={() => setPick(prev => ({ ...prev, [p.id]: x.id }))}
                                className="rounded-md px-2 py-1 text-[11px] transition disabled:cursor-not-allowed"
                                style={isOut(x)
                                  ? { background: "#F3F4F6", color: "#9CA3AF", textDecoration: "line-through" }
                                  : on ? { background: BRAND.soft, color: BRAND.deep, fontWeight: 600 }
                                       : { background: "#F7F7F8", color: "#4B5563" }}>
                                {x.title}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                        <div>
                          <div className="text-[16px] font-semibold tabular-nums">{tug(v.price)}</div>
                          {out ? (
                            <span className="mt-0.5 inline-block rounded-full bg-ui-tag-red-bg px-2 py-0.5 text-[10.5px] font-semibold text-ui-tag-red-text">Дууссан</span>
                          ) : left == null ? (
                            <span className="text-[11px] text-ui-fg-muted">Хязгааргүй</span>
                          ) : (
                            <span className={`text-[11px] font-medium tabular-nums ${left <= 5 ? "text-ui-tag-orange-text" : "text-ui-fg-muted"}`}>{left} ширхэг</span>
                          )}
                        </div>
                        {out ? (
                          <span className="text-[11px] font-medium text-ui-fg-muted">Сагслах боломжгүй</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => decVariant(v.id)} disabled={!inCart}
                              className="grid h-8 w-8 place-items-center rounded-full border text-lg leading-none disabled:opacity-35"
                              style={{ borderColor: "rgba(0,0,0,.1)" }}>−</button>
                            <span className="w-6 text-center text-[15px] font-semibold tabular-nums">{inCart}</span>
                            <button type="button" onClick={() => addVariant(p, v)} aria-label="Нэмэх"
                              className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-white transition hover:opacity-90"
                              style={{ background: BRAND.grad }}>+</button>
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

        {/* ---------- Ticket ---------- */}
        <aside className="flex w-[390px] shrink-0 flex-col border-l border-ui-border-base bg-white 2xl:w-[430px]">
          <div className="flex items-center justify-between px-5 py-4" style={{ background: BRAND.soft }}>
            <div>
              <div className="text-[16px] font-semibold" style={{ color: BRAND.deep }}>Төлбөр</div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: BRAND.deep, opacity: .75 }}>{new Date().toLocaleDateString("mn-MN")}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px]" style={{ color: BRAND.deep, opacity: .75 }}>Сонгосон</div>
              <div className="text-[15px] font-semibold tabular-nums" style={{ color: BRAND.deep }}>{count} ширхэг</div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {lines.length === 0 ? (
              <div className="grid place-items-center py-16 text-center">
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-full text-ui-fg-muted" style={{ background: BRAND.soft }}><ShoppingBag /></div>
                <div className="text-sm font-medium">Сагс хоосон байна</div>
                <div className="mt-1 text-[12.5px] text-ui-fg-subtle">Зүүн талаас бараа сонгоно уу.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map(l => (
                  <div key={l.variant_id} className="rounded-xl border p-3" style={{ borderColor: "rgba(0,0,0,.07)" }}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{l.title}</div>
                      <button type="button" onClick={() => removeLine(l.variant_id)} aria-label="Хасах"
                        className="shrink-0 text-ui-fg-muted hover:text-ui-fg-error"><XMark /></button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => decVariant(l.variant_id)}
                          className="grid h-7 w-7 place-items-center rounded-full border" style={{ borderColor: "rgba(0,0,0,.1)" }}>−</button>
                        <input type="number" min={1} max={l.max ?? undefined} value={l.quantity}
                          onChange={e => {
                            const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                            if (l.max != null && n > l.max) { toast.error(`Зөвхөн ${l.max} ширхэг үлдсэн.`); setLine(l.variant_id, { quantity: l.max }); return; }
                            setLine(l.variant_id, { quantity: n });
                          }}
                          className="h-7 w-11 rounded border bg-white text-center text-[13px] tabular-nums outline-none focus:border-[#E76F61]"
                          style={{ borderColor: "rgba(0,0,0,.12)" }} />
                        <button type="button" onClick={() => setLine(l.variant_id, { quantity: l.max != null ? Math.min(l.max, l.quantity + 1) : l.quantity + 1 })}
                          disabled={l.max != null && l.quantity >= l.max}
                          className="grid h-7 w-7 place-items-center rounded-full border disabled:opacity-40" style={{ borderColor: "rgba(0,0,0,.1)" }}>+</button>
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
            <div className="mb-2">
              {applied ? (
                <div className="flex items-center justify-between rounded-lg bg-ui-tag-green-bg px-3 py-2">
                  <span className="text-[12.5px] font-medium text-ui-tag-green-text">
                    {applied.code} · {applied.type === "percentage" ? `${applied.value}%` : tug(applied.value)}
                  </span>
                  <button type="button" onClick={() => setApplied(null)} className="text-[12px] text-ui-tag-green-text hover:opacity-80">Хасах</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input value={codeInput} size="small" placeholder="Хямдралын код"
                    onChange={e => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCode(); } }}
                    className="flex-1" />
                  <Button variant="secondary" size="small" onClick={applyCode} isLoading={checking} disabled={!codeInput.trim()}>Хэрэглэх</Button>
                </div>
              )}
            </div>

            <div className="mb-3 flex items-center gap-2">
              <span className="shrink-0 text-[12.5px] font-medium text-ui-fg-subtle">Хямдрал</span>
              <Input inputMode="numeric" value={discVal} onChange={e => setDiscVal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" size="small" className="flex-1" />
              <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "rgba(0,0,0,.12)" }}>
                {(["pct", "amt"] as const).map(m => (
                  <button key={m} type="button" onClick={() => setDiscMode(m)}
                    className="px-2.5 py-1 text-[12px] transition"
                    style={discMode === m ? { background: BRAND.soft, color: BRAND.deep, fontWeight: 600 } : { background: "#F7F7F8", color: "#6B7280" }}>
                    {m === "pct" ? "%" : "₮"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ui-fg-subtle">Дүн</span><span className="tabular-nums">{tug(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-ui-fg-subtle">Хямдрал</span>
                  <span className="tabular-nums" style={{ color: BRAND.deep }}>−{tug(discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-[15px] font-semibold">Нийт</span>
                <span className="text-[22px] font-semibold tabular-nums" style={{ color: BRAND.deep }}>{tug(total)}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Харилцагч" size="small" />
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Утас" size="small" />
            </div>

            {/* Payment method — visible choices, so QPay is one tap away */}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {PAYMENTS.map(pm => {
                const on = paymentMethod === pm.value;
                return (
                  <button key={pm.value} type="button" onClick={() => setPaymentMethod(pm.value)}
                    className="flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition"
                    style={on
                      ? { background: BRAND.soft, borderColor: BRAND.accent, color: BRAND.deep }
                      : { background: "#fff", borderColor: "rgba(0,0,0,.1)", color: "#6B7280" }}>
                    <span className="text-[13px] font-bold leading-none">{pm.icon}</span>
                    <span className="leading-none">{pm.label}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === "cash" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Input inputMode="numeric" value={cash} onChange={e => setCash(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Авсан мөнгө" size="small" />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {[total, 20000, 50000, 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => (
                      <button key={v} type="button" onClick={() => setCash(String(v))}
                        className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: BRAND.soft, color: BRAND.deep }}>
                        {v === total ? "Яг таг" : tug(v)}
                      </button>
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

            <button type="button"
              onClick={() => (paymentMethod === "qpay" ? startQpay() : submit())}
              disabled={saving || qpayBusy || !lines.length || cashShort}
              className="mt-3 h-12 w-full rounded-xl text-[15px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: BRAND.grad, boxShadow: "0 12px 24px -14px rgba(211,90,76,.9)" }}>
              {saving || qpayBusy
                ? "Түр хүлээнэ үү…"
                : !lines.length
                  ? "Төлбөр авах"
                  : paymentMethod === "qpay"
                    ? `QPay QR үүсгэх · ${tug(total)}`
                    : `Төлбөр авах · ${tug(total)}`}
            </button>

            {last && (
              <div className="mt-2 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: BRAND.soft }}>
                <span className="text-[12px]" style={{ color: BRAND.deep }}>Сүүлд: <b>{last.no}</b> · {tug(last.total)}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => printReceipt(last)} className="text-[12px] font-semibold" style={{ color: BRAND.deep }}>Баримт</button>
                  <button type="button" onClick={() => setLast(null)} className="text-[12px] text-ui-fg-muted">Хаах</button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ---------- QPay ---------- */}
      {qpay && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: BRAND.grad }}><Sun size={18} /></span>
                <div>
                  <div className="text-[17px] font-semibold">QPay-ээр төлөх</div>
                  <div className="mt-0.5 text-[13px] text-ui-fg-subtle">Худалдан авагч QR-ыг уншуулна уу</div>
                </div>
              </div>
              <button type="button" onClick={cancelQpay} aria-label="Хаах" className="text-ui-fg-muted hover:text-ui-fg-base"><XMark /></button>
            </div>

            <div className="mt-4 text-center text-[30px] font-semibold tabular-nums" style={{ color: BRAND.deep }}>{tug(qpay.amount)}</div>

            <div className="mt-4 grid place-items-center">
              {qrSrc ? (
                <img src={qrSrc} alt="QPay QR" className="h-56 w-56 rounded-xl border bg-white object-contain p-2" style={{ borderColor: BRAND.soft }} />
              ) : (
                <div className="w-full break-all rounded-xl p-3 text-center font-mono text-[11px]" style={{ background: BRAND.soft }}>
                  {qpay.qrText || "QR бэлтгэгдэж байна…"}
                </div>
              )}
            </div>

            {qpay.urls?.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-[12px] font-medium text-ui-fg-subtle">Банкны аппаар нээх</div>
                <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">
                  {qpay.urls.map((u, i) => (
                    <a key={i} href={u.link} target="_blank" rel="noreferrer"
                      className="truncate rounded-lg border px-3 py-2 text-[12.5px] hover:bg-ui-bg-subtle" style={{ borderColor: "rgba(0,0,0,.1)" }}>
                      {u.name || u.description || "Банк"}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <span className={`flex items-center gap-2 text-[13px] ${qpayStatus === "failed" ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}`}>
                {qpayStatus !== "failed" && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: BRAND.accent }} />
                )}
                {qpayStatus === "failed" ? "Төлбөр амжилтгүй боллоо" : saving ? "Захиалга бүртгэж байна…" : "Төлбөр хүлээгдэж байна…"}
              </span>
              <Button variant="secondary" size="small" onClick={cancelQpay} disabled={saving}>Болих</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function CatCard({ name, n, active, onClick }: { name: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="shrink-0 rounded-2xl border px-4 py-3 text-left transition"
      style={active
        ? { background: BRAND.grad, borderColor: "transparent", color: "#fff", boxShadow: "0 12px 24px -16px rgba(211,90,76,.9)" }
        : { background: "#fff", borderColor: "rgba(0,0,0,.07)", color: "inherit" }}>
      <div className="text-[13.5px] font-semibold leading-none">{name}</div>
      <div className="mt-1.5 text-[11.5px] tabular-nums" style={{ opacity: active ? .85 : .55 }}>{n} бараа</div>
    </button>
  );
}

export const config = defineRouteConfig({
  label: "Кассын систем (POS)",
  icon: ShoppingBag,
});

export default OfflineSalePage;
