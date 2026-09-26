import { defineRouteConfig } from "@medusajs/admin-sdk";
import { PencilSquare } from "@medusajs/icons";
import { Container, Text, Table, Badge, Button, Checkbox, Input, Select, Label, toast } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, Panel } from "../../lib/ui";

type Cat = { id: string; name: string };
type Prod = { id: string; title: string; status: string; thumbnail: string; price: number | null; categories: Cat[] };

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.message || `Request failed (${res.status})`);
  }
  return res.json();
}

const nf = (n: number) => new Intl.NumberFormat("mn-MN").format(n || 0);
const tug = (n: number | null) => (n == null ? "—" : `₮${nf(n)}`);
const PAGE = 50;

const BulkEditPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const canWrite = can("catalog.write");

  const [cats, setCats] = useState<Cat[]>([]);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [products, setProducts] = useState<Prod[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Bulk action inputs
  const [setStatus, setSetStatus] = useState("");
  const [setPrice, setSetPrice] = useState("");
  const [catAdd, setCatAdd] = useState("");
  const [catRemove, setCatRemove] = useState("");
  const [setGender, setSetGender] = useState("");
  const [setStockVal, setSetStockVal] = useState("");

  useEffect(() => {
    adminFetch("/product-categories?limit=100&fields=id,name")
      .then((j) => setCats((j.product_categories || []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  const load = async (newOffset = offset) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(newOffset) });
      if (q) params.set("q", q);
      if (catFilter) params.set("category_id", catFilter);
      const j = await adminFetch(`/catalog/products?${params.toString()}`);
      setProducts(j.products || []);
      setCount(j.count || 0);
      setOffset(newOffset);
    } catch (e: any) {
      toast.error(e.message || "Бараа ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(0); /* eslint-disable-next-line */ }, [q, catFilter]);

  const allOnPage = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllPage = () => setSelected((prev) => {
    const n = new Set(prev); const ids = products.map((p) => p.id);
    ids.every((id) => n.has(id)) ? ids.forEach((id) => n.delete(id)) : ids.forEach((id) => n.add(id));
    return n;
  });

  const hasChange = useMemo(
    () => setStatus || setPrice.trim() || catAdd || catRemove || setGender || setStockVal.trim(),
    [setStatus, setPrice, catAdd, catRemove, setGender, setStockVal],
  );

  const apply = async () => {
    if (!selected.size || !hasChange) return;
    const set: any = {};
    if (setStatus) set.status = setStatus;
    if (setPrice.trim()) set.price = Number(setPrice);
    if (catAdd) set.category_add = catAdd;
    if (catRemove) set.category_remove = catRemove;
    if (setGender) set.gender = setGender;
    if (setStockVal.trim() !== "") set.stock = Number(setStockVal);
    setBusy(true);
    try {
      const r = await adminFetch("/catalog/bulk-edit", {
        method: "POST",
        body: JSON.stringify({ product_ids: [...selected], set }),
      });
      const parts = Object.keys(r.applied || {});
      toast.success(`${nf(r.count)} бараанд хэрэгжлээ: ${parts.join(", ") || "—"}`);
      if (r.errors) toast.warning(`Алдаа: ${Object.keys(r.errors).join(", ")}`);
      setSetStatus(""); setSetPrice(""); setCatAdd(""); setCatRemove(""); setSetGender(""); setSetStockVal("");
      setSelected(new Set());
      await load(offset);
    } catch (e: any) {
      toast.error(e.message || "Багц засвар амжилтгүй");
    } finally {
      setBusy(false);
    }
  };

  if (!permLoading && !can("catalog.read")) {
    return <AccessDenied title="Багц засвар" perm="catalog.read" />;
  }

  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(count / PAGE));

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Багц засвар"
        description="Олон бараа сонгоод үнэ, төлөв, ангиллыг нэг дор өөрчилнө (олон мянган бараанд зориулав)."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 px-6 py-3">
        <div className="flex flex-col gap-1">
          <Label size="small">Хайх</Label>
          <div className="flex gap-2">
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQ(qInput)}
              placeholder="Барааны нэр…"
              className="w-[220px]"
            />
            <Button variant="secondary" size="small" onClick={() => setQ(qInput)}>Хайх</Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label size="small">Ангилал</Label>
          <div className="w-[200px]">
            <Select size="small" value={catFilter || "all"} onValueChange={(v) => setCatFilter(v === "all" ? "" : v)}>
              <Select.Trigger><Select.Value placeholder="Бүгд" /></Select.Trigger>
              <Select.Content>
                <Select.Item value="all">Бүгд</Select.Item>
                {cats.map((c) => <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>)}
              </Select.Content>
            </Select>
          </div>
        </div>
        <Text className="text-ui-fg-subtle ml-auto" size="small">
          Нийт {nf(count)} · Сонгосон {nf(selected.size)}
        </Text>
      </div>

      {/* Bulk action bar */}
      {canWrite && (
        <div className="flex flex-wrap items-end gap-3 bg-ui-bg-subtle px-6 py-3">
          <div className="flex flex-col gap-1">
            <Label size="small">Төлөв</Label>
            <div className="w-[150px]">
              <Select size="small" value={setStatus} onValueChange={setSetStatus}>
                <Select.Trigger><Select.Value placeholder="Өөрчлөхгүй" /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="published">Нийтлэх</Select.Item>
                  <Select.Item value="draft">Ноорог</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small">Үнэ (₮)</Label>
            <Input value={setPrice} onChange={(e) => setSetPrice(e.target.value)} placeholder="Өөрчлөхгүй" className="w-[120px]" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small">Ангилал нэмэх</Label>
            <div className="w-[170px]">
              <Select size="small" value={catAdd} onValueChange={setCatAdd}>
                <Select.Trigger><Select.Value placeholder="—" /></Select.Trigger>
                <Select.Content>
                  {cats.map((c) => <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>)}
                </Select.Content>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small">Ангилал хасах</Label>
            <div className="w-[170px]">
              <Select size="small" value={catRemove} onValueChange={setCatRemove}>
                <Select.Trigger><Select.Value placeholder="—" /></Select.Trigger>
                <Select.Content>
                  {cats.map((c) => <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>)}
                </Select.Content>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small">Нөөц (үлдэгдэл)</Label>
            <Input value={setStockVal} onChange={(e) => setSetStockVal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Өөрчлөхгүй" className="w-[110px]" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small">Хүйс (Эр/Эм)</Label>
            <div className="w-[150px]">
              <Select size="small" value={setGender} onValueChange={setSetGender}>
                <Select.Trigger><Select.Value placeholder="Өөрчлөхгүй" /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="Women">Эмэгтэй</Select.Item>
                  <Select.Item value="Men">Эрэгтэй</Select.Item>
                  <Select.Item value="Unisex">Юнисекс</Select.Item>
                  <Select.Item value="none">Арилгах</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </div>
          <Button variant="primary" onClick={apply} disabled={!selected.size || !hasChange || busy} isLoading={busy}>
            {nf(selected.size)} бараанд хэрэгжүүлэх
          </Button>
        </div>
      )}

      {/* Product table */}
      <Panel>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell className="w-8">
              <Checkbox checked={allOnPage} onCheckedChange={toggleAllPage} disabled={!products.length} />
            </Table.HeaderCell>
            <Table.HeaderCell>Бараа</Table.HeaderCell>
            <Table.HeaderCell>Төлөв</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Үнэ</Table.HeaderCell>
            <Table.HeaderCell>Ангилал</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {!loading && products.length === 0 && (
            <Table.Row><Table.Cell {...({ colSpan: 5 } as any)}><Text className="text-ui-fg-subtle py-6" size="small">Бараа олдсонгүй.</Text></Table.Cell></Table.Row>
          )}
          {products.map((p) => (
            <Table.Row key={p.id}>
              <Table.Cell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} /></Table.Cell>
              <Table.Cell>
                <div className="flex items-center gap-2">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-ui-bg-subtle" />}
                  <span>{p.title}</span>
                </div>
              </Table.Cell>
              <Table.Cell>
                <Badge color={p.status === "published" ? "green" : "grey"} size="2xsmall">{p.status === "published" ? "Нийтэлсэн" : "Ноорог"}</Badge>
              </Table.Cell>
              <Table.Cell className="text-right font-medium">{tug(p.price)}</Table.Cell>
              <Table.Cell className="text-ui-fg-subtle text-xs">{p.categories.map((c) => c.name).join(", ") || "—"}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      </Panel>

      {/* Pagination */}
      <div className="flex items-center justify-between px-6 py-3">
        <Text className="text-ui-fg-subtle" size="small">Хуудас {page} / {pages}</Text>
        <div className="flex gap-2">
          <Button variant="secondary" size="small" disabled={offset === 0 || loading} onClick={() => load(Math.max(0, offset - PAGE))}>Өмнөх</Button>
          <Button variant="secondary" size="small" disabled={offset + PAGE >= count || loading} onClick={() => load(offset + PAGE)}>Дараах</Button>
        </div>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Багц засвар",
  icon: PencilSquare,
});

export default BulkEditPage;
