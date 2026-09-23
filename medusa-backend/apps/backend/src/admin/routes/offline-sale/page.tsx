import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ShoppingBag } from "@medusajs/icons";
import { Container, Text, Button, Input, Label, Select, Badge, Table, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, Panel, TableCard } from "../../lib/ui";
import { tug, PAY_LABEL, printReceipt, type Receipt } from "../../lib/receipt";

type Variant = { id: string; title: string; sku: string; price: number; manage: boolean; stock: number | null };
type Product = { id: string; title: string; thumbnail: string; variants: Variant[] };
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

const OfflineSalePage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cash, setCash] = useState("");            // cash received (string input)
  const [discMode, setDiscMode] = useState<"pct" | "amt">("pct");
  const [discVal, setDiscVal] = useState("");       // discount value (% or ₮)
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<Receipt | null>(null);
  const [today, setToday] = useState<{ count: number; total: number } | null>(null);

  const loadSummary = () => adminFetch("/offline-sale?summary=1").then(r => setToday(r.summary)).catch(() => {});
  useEffect(() => { loadSummary(); }, []);

  // Debounced product search.
  useEffect(() => {
    let alive = true;
    setSearching(true);
    const h = setTimeout(async () => {
      try {
        const { products } = await adminFetch(`/offline-sale?q=${encodeURIComponent(q)}`);
        if (alive) setResults(products || []);
      } catch { if (alive) setResults([]); }
      finally { if (alive) setSearching(false); }
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q]);

  if (!permLoading && !can("orders.write")) {
    return <AccessDenied title="Борлуулалт бүртгэх" perm="orders.write" />;
  }

  const addVariant = (p: Product, v: Variant) => {
    if (v.manage && (v.stock ?? 0) <= 0) { toast.error(`${v.title} — үлдэгдэлгүй байна.`); return; }
    setLines(prev => {
      const found = prev.find(l => l.variant_id === v.id);
      if (found) {
        if (found.max != null && found.quantity >= found.max) { toast.error(`${v.title} — зөвхөн ${found.max} ширхэг үлдсэн.`); return prev; }
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
  const incLine = (l: Line) => {
    if (l.max != null && l.quantity >= l.max) { toast.error(`Зөвхөн ${l.max} ширхэг үлдсэн.`); return; }
    setLine(l.variant_id, { quantity: l.quantity + 1 });
  };
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.variant_id !== id));

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
          email: email.trim() || undefined,
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
      toast.success(`Борлуулалт бүртгэгдлээ (${no}) · ${tug(r.total ?? total)}${r.paid ? " · Төлсөн" : ""}`);
      setLines([]); setCustomerName(""); setPhone(""); setEmail(""); setNote(""); setPaymentMethod("cash"); setCash(""); setDiscVal("");
      loadSummary();
    } catch (e: any) {
      toast.error(e?.message || "Борлуулалт бүртгэхэд алдаа гарлаа");
    } finally { setSaving(false); }
  }

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Борлуулалт бүртгэх"
        description="Дэлгүүр дээр / бодит амьдрал дээр хийсэн борлуулалтаа энд бүртгэнэ — онлайн борлуулалттай нэг дор нэгдэж, тайлан/аналитикт тооцогдоно."
        actions={
          <div className="flex items-center gap-3">
            {today && (
              <Badge size="small" color="green">Өнөөдөр: {today.count} зарлага · {tug(today.total)}</Badge>
            )}
            <Button variant="primary" onClick={submit} disabled={saving || !lines.length || cashShort} isLoading={saving}>Борлуулалт бүртгэх</Button>
          </div>
        }
      />

      {/* Last sale → print */}
      {last && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ui-bg-subtle px-6 py-3">
          <Text size="small">
            Сүүлд бүртгэсэн: <b>{last.no}</b> · {tug(last.total)}
            {last.change != null && last.change > 0 ? ` · Хариулт ${tug(last.change)}` : ""}
          </Text>
          <div className="flex items-center gap-2">
            <Button size="small" variant="secondary" onClick={() => printReceipt(last)}>Баримт хэвлэх</Button>
            <button type="button" onClick={() => setLast(null)} className="text-ui-fg-muted hover:text-ui-fg-base txt-compact-small">Хаах</button>
          </div>
        </div>
      )}

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
        {/* Product picker */}
        <div>
          <Label size="small" className="mb-1.5 block">Бараа хайх</Label>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Барааны нэрээр хайх…" />
          <div className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-ui-border-base divide-y divide-ui-border-base">
            {searching && results.length === 0 && (
              <div className="px-4 py-6 text-center"><Text size="small" className="text-ui-fg-subtle">Хайж байна…</Text></div>
            )}
            {!searching && results.length === 0 && (
              <div className="px-4 py-6 text-center"><Text size="small" className="text-ui-fg-subtle">Бараа олдсонгүй.</Text></div>
            )}
            {results.map(p => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {p.thumbnail
                    ? <img src={p.thumbnail} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md object-cover bg-ui-bg-subtle" />
                    : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ui-bg-subtle text-ui-fg-muted"><ShoppingBag /></div>}
                  <Text size="small" weight="plus" className="truncate">{p.title}</Text>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {p.variants.map(v => {
                    const out = v.manage && (v.stock ?? 0) <= 0;
                    return (
                      <button key={v.id} type="button" disabled={out} onClick={() => addVariant(p, v)}
                        className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-fg ${out ? "bg-ui-bg-disabled cursor-not-allowed opacity-60" : "bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover"}`}>
                        <span className="min-w-0 truncate txt-compact-small">{v.title !== p.title ? v.title : "Үндсэн хувилбар"} {v.sku ? <span className="text-ui-fg-muted">· {v.sku}</span> : null}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="txt-compact-small tabular-nums">{tug(v.price)}</span>
                          {v.manage
                            ? <Badge size="2xsmall" color={out ? "red" : (v.stock ?? 0) <= 5 ? "orange" : "grey"}>{out ? "Үлдэгдэлгүй" : `Үлд: ${v.stock}`}</Badge>
                            : <Badge size="2xsmall" color="grey">Хязгааргүй</Badge>}
                          {!out && <span className="text-ui-fg-interactive txt-compact-small-plus">+ Нэмэх</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected lines */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label size="small">Сонгосон бараа {count > 0 && <Badge size="2xsmall" className="ml-1">{count}</Badge>}</Label>
            {lines.length > 0 && <button type="button" onClick={() => setLines([])} className="txt-compact-small text-ui-fg-muted hover:text-ui-fg-base">Цэвэрлэх</button>}
          </div>
          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ui-border-base px-4 py-10 text-center">
              <Text size="small" className="text-ui-fg-subtle">Зүүн талаас бараа сонгоно уу.</Text>
            </div>
          ) : (
            <TableCard>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Бараа</Table.HeaderCell>
                    <Table.HeaderCell>Тоо</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Нэгж үнэ</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Дүн</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {lines.map(l => (
                    <Table.Row key={l.variant_id}>
                      <Table.Cell className="max-w-[180px] truncate">{l.title}</Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setLine(l.variant_id, { quantity: Math.max(1, l.quantity - 1) })} className="grid h-6 w-6 place-items-center rounded bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover">−</button>
                          <span className="w-6 text-center tabular-nums txt-compact-small">{l.quantity}</span>
                          <button type="button" onClick={() => incLine(l)} disabled={l.max != null && l.quantity >= l.max} className="grid h-6 w-6 place-items-center rounded bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed">+</button>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <input type="number" min={0} value={l.unit_price}
                          onChange={e => setLine(l.variant_id, { unit_price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                          className="w-24 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-right tabular-nums txt-compact-small outline-none focus:border-ui-fg-interactive" />
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums font-medium">{tug(l.unit_price * l.quantity)}</Table.Cell>
                      <Table.Cell>
                        <button type="button" onClick={() => removeLine(l.variant_id)} className="text-ui-fg-muted hover:text-ui-fg-error txt-compact-small">✕</button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </TableCard>
          )}
          {/* Discount */}
          <div className="mt-3 flex items-center gap-2">
            <Label size="small" className="shrink-0">Хямдрал</Label>
            <Input inputMode="numeric" value={discVal} onChange={e => setDiscVal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" className="flex-1" />
            <div className="flex overflow-hidden rounded-md border border-ui-border-base">
              {(["pct", "amt"] as const).map(m => (
                <button key={m} type="button" onClick={() => setDiscMode(m)}
                  className={`px-3 py-1.5 txt-compact-small ${discMode === m ? "bg-ui-bg-base-pressed font-medium" : "bg-ui-bg-subtle text-ui-fg-muted hover:bg-ui-bg-subtle-hover"}`}>{m === "pct" ? "%" : "₮"}</button>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-1 rounded-lg bg-ui-bg-subtle px-4 py-3">
            {discount > 0 && (
              <>
                <div className="flex items-center justify-between text-ui-fg-subtle"><Text size="small">Дүн</Text><Text size="small" className="tabular-nums">{tug(subtotal)}</Text></div>
                <div className="flex items-center justify-between text-ui-fg-subtle"><Text size="small">Хямдрал</Text><Text size="small" className="tabular-nums">−{tug(discount)}</Text></div>
              </>
            )}
            <div className="flex items-center justify-between">
              <Text weight="plus">Нийт дүн</Text>
              <Text weight="plus" className="text-lg tabular-nums">{tug(total)}</Text>
            </div>
          </div>
        </div>
      </div>

      {/* Customer + payment */}
      <Panel title="Харилцагч ба төлбөр" bodyClassName="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label size="small" className="mb-1.5 block">Харилцагчийн нэр (заавал биш)</Label>
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Бат Эрдэнэ" />
          </div>
          <div>
            <Label size="small" className="mb-1.5 block">Утас (заавал биш)</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+976 …" />
          </div>
          <div>
            <Label size="small" className="mb-1.5 block">Имэйл (заавал биш)</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ta@email.com" />
          </div>
          <div>
            <Label size="small" className="mb-1.5 block">Төлбөрийн хэлбэр</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <Select.Trigger><Select.Value placeholder="Сонгох…" /></Select.Trigger>
              <Select.Content>
                {PAYMENTS.map(p => <Select.Item key={p.value} value={p.value}>{p.label}</Select.Item>)}
              </Select.Content>
            </Select>
          </div>

          {/* Cash received → change (cash only) */}
          {paymentMethod === "cash" && (
            <>
              <div>
                <Label size="small" className="mb-1.5 block">Авсан бэлэн мөнгө</Label>
                <Input inputMode="numeric" value={cash} onChange={e => setCash(e.target.value.replace(/[^0-9]/g, ""))} placeholder={String(total || "")} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[total, 20000, 50000, 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => (
                    <button key={v} type="button" onClick={() => setCash(String(v))}
                      className="rounded-md bg-ui-bg-subtle px-2 py-1 txt-compact-small hover:bg-ui-bg-subtle-hover">{v === total ? "Яг таг" : tug(v)}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label size="small" className="mb-1.5 block">Хариулт</Label>
                <div className={`flex h-10 items-center rounded-lg px-3 tabular-nums text-lg font-medium ${cashShort ? "bg-ui-tag-red-bg text-ui-tag-red-text" : "bg-ui-tag-green-bg text-ui-tag-green-text"}`}>
                  {cash === "" ? "—" : cashShort ? `Дутуу ${tug(total - cashNum)}` : tug(change ?? 0)}
                </div>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <Label size="small" className="mb-1.5 block">Тэмдэглэл (заавал биш)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Жишээ: дэлгүүрийн касс, хямдралтай…" />
          </div>
        </div>
      </Panel>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Борлуулалт бүртгэх",
  icon: ShoppingBag,
});

export default OfflineSalePage;
