import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ShoppingBag, MagnifyingGlass, XMark } from "@medusajs/icons";
import { Button, Input, toast } from "@medusajs/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { tug, PAY_LABEL, printReceipt, type Receipt } from "../../lib/receipt";
import naranLogo from "../../assets/naran-logo.png";

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

type Variant = { id: string; title: string; sku: string; price: number; manage: boolean; stock: number | null };
type Category = { id: string; name: string; handle: string };
type Product = { id: string; title: string; thumbnail: string; brand: string; gender: string; isNew?: boolean; isGift?: boolean; categories: Category[]; variants: Variant[] };
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
const PAYMENTS: { value: string; label: string }[] = [
  { value: "cash", label: "Бэлэн" },
  { value: "qpay", label: "QPay" },
  { value: "card", label: "Карт" },
  { value: "transfer", label: "Шилжүүлэг" },
];

// Exactly the storefront's nav categories, so the shop floor and the website
// speak the same language (Эрэгтэй · Эмэгтэй · Шинэ ирсэн · Бэлгийн багц).
const FILTERS: { key: string; label: string; match: (p: Product) => boolean }[] = [
  { key: "all", label: "Бүгд", match: () => true },
  { key: "men", label: "Эрэгтэй", match: p => p.gender === "Men" },
  { key: "women", label: "Эмэгтэй", match: p => p.gender === "Women" },
  { key: "new", label: "Шинэ ирсэн", match: p => !!p.isNew },
  { key: "gift", label: "Бэлгийн багц", match: p => !!p.isGift },
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
  const [filter, setFilter] = useState("all");
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
  // Progressive disclosure: the ticket stays calm until the cashier needs these.
  const [openCode, setOpenCode] = useState(false);
  const [openDisc, setOpenDisc] = useState(false);
  const [openCust, setOpenCust] = useState(false);
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

  // Live count per storefront category, so the cards show real numbers.
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of FILTERS) out[f.key] = products.filter(f.match).length;
    return out;
  }, [products]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const active = FILTERS.find(f => f.key === filter) || FILTERS[0];
    return products.filter(p => {
      if (!active.match(p)) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        (p.brand || "").toLowerCase().includes(needle) ||
        p.variants.some(v => (v.sku || "").toLowerCase().includes(needle))
      );
    });
  }, [products, q, filter]);

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
          <img src={naranLogo} alt="Naran Amerik Baraa" className="h-11 w-auto" />
          <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.16em]"
            style={{ background: BRAND.soft, color: BRAND.deep }}>POS</span>
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
          {/* Categories — identical to the storefront's nav */}
          <div className="flex shrink-0 items-center gap-2.5 overflow-x-auto px-5 pt-4 pb-3">
            {FILTERS.map(f => (
              <CatCard key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)} name={f.label} n={counts[f.key] ?? 0} />
            ))}
            <span className="ml-auto shrink-0 pl-3 text-[12px] tabular-nums text-ui-fg-muted">{visible.length} бараа</span>
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
        <aside className="flex w-[380px] shrink-0 flex-col bg-white 2xl:w-[420px]" style={{ borderLeft: "1px solid rgba(0,0,0,.07)" }}>
          {/* Header — quiet label, no heavy tint */}
          <div className="flex items-baseline justify-between px-6 pb-4 pt-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.2em] text-ui-fg-muted">Тасалбар</div>
              <div className="mt-1.5 text-[12px] text-ui-fg-muted">{new Date().toLocaleDateString("mn-MN")}</div>
            </div>
            {count > 0 && <div className="text-[13px] tabular-nums text-ui-fg-subtle">{count} ширхэг</div>}
          </div>

          {/* Items — hairline rows, no boxes */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 pb-20 text-center">
                <div className="grid h-11 w-11 place-items-center rounded-full text-ui-fg-muted" style={{ background: "#F6F3F2" }}>
                  <ShoppingBag />
                </div>
                <div className="text-[13.5px] font-medium">Сагс хоосон</div>
                <div className="text-[12.5px] text-ui-fg-muted">Зүүн талаас бараа сонгоно уу</div>
              </div>
            ) : (
              <div className="pb-2">
                {lines.map((l, i) => (
                  <div key={l.variant_id} className="group py-3.5"
                    style={i === 0 ? undefined : { borderTop: "1px solid rgba(0,0,0,.05)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 text-[13px] leading-snug">{l.title}</div>
                      <div className="shrink-0 text-[13.5px] font-semibold tabular-nums">{tug(l.unit_price * l.quantity)}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <button type="button" onClick={() => decVariant(l.variant_id)} aria-label="Хасах"
                          className="grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-ui-fg-subtle transition hover:bg-[#F6F3F2]">−</button>
                        <span className="min-w-[14px] text-center text-[13px] font-medium tabular-nums">{l.quantity}</span>
                        <button type="button" onClick={() => setLine(l.variant_id, { quantity: l.max != null ? Math.min(l.max, l.quantity + 1) : l.quantity + 1 })}
                          disabled={l.max != null && l.quantity >= l.max} aria-label="Нэмэх"
                          className="grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-ui-fg-subtle transition hover:bg-[#F6F3F2] disabled:opacity-30">+</button>
                        <span className="text-[11.5px] text-ui-fg-muted">× {tug(l.unit_price)}</span>
                      </div>
                      <button type="button" onClick={() => removeLine(l.variant_id)}
                        className="text-[11.5px] text-ui-fg-muted opacity-0 transition hover:text-ui-fg-error group-hover:opacity-100">
                        Устгах
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setLines([])}
                  className="mt-2 text-[12px] text-ui-fg-muted transition hover:text-ui-fg-base">Сагс цэвэрлэх</button>
              </div>
            )}
          </div>

          {/* Summary + payment */}
          <div className="px-6 pb-6 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,.07)" }}>
            {/* Optional fields stay out of the way until asked for */}
            <div className="mb-3 flex items-center gap-3 text-[12px]">
              {!applied && (
                <button type="button" onClick={() => setOpenCode(v => !v)}
                  className="transition hover:opacity-70" style={{ color: openCode ? BRAND.deep : "#8A8A8A" }}>Код</button>
              )}
              <button type="button" onClick={() => setOpenDisc(v => !v)}
                className="transition hover:opacity-70" style={{ color: openDisc ? BRAND.deep : "#8A8A8A" }}>Хямдрал</button>
              <button type="button" onClick={() => setOpenCust(v => !v)}
                className="transition hover:opacity-70" style={{ color: openCust ? BRAND.deep : "#8A8A8A" }}>Харилцагч</button>
            </div>

            {applied && (
              <div className="mb-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: BRAND.soft }}>
                <span className="text-[12.5px] font-medium" style={{ color: BRAND.deep }}>
                  {applied.code} · {applied.type === "percentage" ? `${applied.value}%` : tug(applied.value)}
                </span>
                <button type="button" onClick={() => setApplied(null)} className="text-[12px]" style={{ color: BRAND.deep, opacity: .7 }}>Хасах</button>
              </div>
            )}

            {openCode && !applied && (
              <div className="mb-3 flex items-center gap-2">
                <input value={codeInput} placeholder="Хямдралын код"
                  onChange={e => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCode(); } }}
                  className="h-10 flex-1 rounded-lg px-3 text-[13px] outline-none transition focus:bg-white"
                  style={{ background: "#F6F3F2" }} />
                <button type="button" onClick={applyCode} disabled={!codeInput.trim() || checking}
                  className="h-10 rounded-lg px-3.5 text-[12.5px] font-medium transition disabled:opacity-40"
                  style={{ background: BRAND.soft, color: BRAND.deep }}>
                  {checking ? "…" : "Хэрэглэх"}
                </button>
              </div>
            )}

            {openDisc && (
              <div className="mb-3 flex items-center gap-2">
                <input inputMode="numeric" value={discVal} placeholder="Хямдралын дүн"
                  onChange={e => setDiscVal(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-10 flex-1 rounded-lg px-3 text-[13px] tabular-nums outline-none transition focus:bg-white"
                  style={{ background: "#F6F3F2" }} />
                <div className="flex h-10 overflow-hidden rounded-lg" style={{ background: "#F6F3F2" }}>
                  {(["pct", "amt"] as const).map(m => (
                    <button key={m} type="button" onClick={() => setDiscMode(m)}
                      className="w-10 text-[12.5px] transition"
                      style={discMode === m ? { background: "#fff", color: BRAND.deep, fontWeight: 600 } : { color: "#8A8A8A" }}>
                      {m === "pct" ? "%" : "₮"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {openCust && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Нэр"
                  className="h-10 rounded-lg px-3 text-[13px] outline-none transition focus:bg-white" style={{ background: "#F6F3F2" }} />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Утас"
                  className="h-10 rounded-lg px-3 text-[13px] outline-none transition focus:bg-white" style={{ background: "#F6F3F2" }} />
              </div>
            )}

            {/* Totals */}
            {discount > 0 && (
              <div className="mb-1 space-y-1 text-[12.5px]">
                <div className="flex items-center justify-between text-ui-fg-muted">
                  <span>Дүн</span><span className="tabular-nums">{tug(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ui-fg-muted">Хямдрал</span>
                  <span className="tabular-nums" style={{ color: BRAND.deep }}>−{tug(discount)}</span>
                </div>
              </div>
            )}
            <div className="flex items-baseline justify-between py-2">
              <span className="text-[13px] text-ui-fg-subtle">Нийт</span>
              <span className="text-[26px] font-semibold leading-none tabular-nums">{tug(total)}</span>
            </div>

            {/* Payment method — quiet segmented control */}
            <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl p-1" style={{ background: "#F6F3F2" }}>
              {PAYMENTS.map(pm => {
                const on = paymentMethod === pm.value;
                return (
                  <button key={pm.value} type="button" onClick={() => setPaymentMethod(pm.value)}
                    className="rounded-lg py-2 text-[12px] font-medium transition"
                    style={on
                      ? { background: "#fff", color: BRAND.deep, boxShadow: "0 1px 2px rgba(0,0,0,.07)" }
                      : { color: "#8A8A8A" }}>
                    {pm.label}
                  </button>
                );
              })}
            </div>

            {paymentMethod === "cash" && (
              <div className="mt-3">
                <input inputMode="numeric" value={cash} placeholder="Авсан мөнгө"
                  onChange={e => setCash(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-10 w-full rounded-lg px-3 text-[13px] tabular-nums outline-none transition focus:bg-white"
                  style={{ background: "#F6F3F2" }} />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {[total, 20000, 50000, 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => (
                    <button key={v} type="button" onClick={() => setCash(String(v))}
                      className="text-[11.5px] text-ui-fg-muted transition hover:opacity-70" style={{ color: BRAND.deep }}>
                      {v === total ? "Яг таг" : tug(v)}
                    </button>
                  ))}
                  {cash !== "" && (
                    <span className="ml-auto text-[12.5px] tabular-nums"
                      style={{ color: cashShort ? "#C0392B" : "#1F7A4D" }}>
                      {cashShort ? `Дутуу ${tug(total - cashNum)}` : `Хариулт ${tug(change ?? 0)}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            <button type="button"
              onClick={() => (paymentMethod === "qpay" ? startQpay() : submit())}
              disabled={saving || qpayBusy || !lines.length || cashShort}
              className="mt-4 h-12 w-full rounded-xl text-[14.5px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: BRAND.grad, boxShadow: "0 10px 22px -14px rgba(211,90,76,.9)" }}>
              {saving || qpayBusy
                ? "Түр хүлээнэ үү…"
                : !lines.length
                  ? "Төлбөр авах"
                  : paymentMethod === "qpay"
                    ? `QPay QR үүсгэх · ${tug(total)}`
                    : `Төлбөр авах · ${tug(total)}`}
            </button>

            {last && (
              <div className="mt-3 flex items-center justify-between text-[12px]">
                <span className="text-ui-fg-muted">Сүүлд <b className="font-semibold text-ui-fg-base">{last.no}</b> · {tug(last.total)}</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => printReceipt(last, naranLogo)} className="font-medium" style={{ color: BRAND.deep }}>Баримт</button>
                  <button type="button" onClick={() => setLast(null)} className="text-ui-fg-muted">Хаах</button>
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
                <img src={naranLogo} alt="Naran Amerik Baraa" className="h-9 w-auto" />
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
