import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Tag, ArrowPath } from "@medusajs/icons";
import { Container, Text, Button, Table, Badge, Textarea, Input, toast } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, StatGrid, StatCard, Panel, EmptyState } from "../../lib/ui";

type Stats = {
  total: number;
  published: number;
  draft: number;
  categories: { id: string; name: string; handle: string; count: number }[];
};

type LowStock = { sku: string; variant: string; product: string; handle: string; stock: number };

type StockHistory = { at: number; sku: string; product: string; from: number; to: number; delta: number; reason: string; actor: string };

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
  return res;
}

const nf = (n: number) => new Intl.NumberFormat("mn-MN").format(n || 0);

const CatalogPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [stats, setStats] = useState<Stats | null>(null);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [csv, setCsv] = useState("");
  const [stockCsv, setStockCsv] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [history, setHistory] = useState<StockHistory[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    try {
      const res = await adminFetch("/catalog/stats");
      setStats(await res.json());
    } catch (e: any) {
      toast.error(e.message || "Статистик ачаалж чадсангүй");
    }
  };
  const loadLowStock = async (th = threshold) => {
    try {
      const res = await adminFetch(`/catalog/low-stock?threshold=${th}`);
      setLowStock((await res.json()).variants || []);
    } catch { /* inventory may be off */ }
  };
  const loadHistory = async () => {
    try {
      const res = await adminFetch("/catalog/stock-history");
      setHistory((await res.json()).moves || []);
    } catch { /* optional */ }
  };
  useEffect(() => { loadStats(); loadHistory(); }, []);
  // Low-stock reloads whenever the threshold changes (and on first mount).
  useEffect(() => { loadLowStock(threshold); }, [threshold]);

  const refreshAll = async () => {
    setRefreshing(true);
    try { await Promise.all([loadStats(), loadLowStock(threshold), loadHistory()]); }
    finally { setRefreshing(false); }
  };

  const canWrite = can("catalog.write");

  const runStock = async () => {
    if (!stockCsv.trim()) { toast.error("CSV хоосон байна"); return; }
    setSavingStock(true);
    try {
      const res = await adminFetch("/catalog/stock", { method: "POST", body: JSON.stringify({ csv: stockCsv, reason: stockReason }) });
      const r = await res.json();
      toast.success(`Нөөц шинэчлэгдлээ: ${nf(r.updated)} хувилбар`);
      if (r.notManaged) toast.warning(`${nf(r.notManaged)} хувилбар нөөц хянадаггүй (алгассан)`);
      setStockCsv("");
      setStockReason("");
      await loadLowStock();
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message || "Нөөц шинэчлэх амжилтгүй");
    } finally {
      setSavingStock(false);
    }
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setCsv(await f.text());
    toast.info(`${f.name} ачаалагдлаа — Импортлох дарна уу`);
  };

  const runImport = async () => {
    if (!csv.trim()) { toast.error("CSV хоосон байна"); return; }
    setImporting(true);
    try {
      const res = await adminFetch("/catalog/import", { method: "POST", body: JSON.stringify({ csv }) });
      const r = await res.json();
      toast.success(`Импорт дууслаа: ${nf(r.created)} нэмэгдсэн, ${nf(r.skipped)} алгассан (${r.seconds}с)`);
      if (r.unmapped?.length) toast.warning(`Тохирохгүй ангилал: ${r.unmapped.join(", ")}`);
      setCsv("");
      if (fileRef.current) fileRef.current.value = "";
      await loadStats();
    } catch (e: any) {
      toast.error(e.message || "Импорт амжилтгүй");
    } finally {
      setImporting(false);
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const res = await adminFetch("/catalog/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "naran-catalog.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Экспорт амжилтгүй");
    } finally {
      setExporting(false);
    }
  };

  if (!permLoading && !can("catalog.read")) {
    return <AccessDenied title="Каталог" perm="catalog.read" />;
  }

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Каталог"
        description="Барааны нэгдсэн тойм + CSV импорт/экспорт (олон мянган бараанд)."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="small" onClick={refreshAll} isLoading={refreshing}>
              <ArrowPath className="text-ui-fg-subtle" /> Сэргээх
            </Button>
            <Button variant="secondary" size="small" onClick={runExport} isLoading={exporting}>CSV татах</Button>
          </div>
        }
      />

      {/* Stats */}
      <StatGrid cols={3}>
        <StatCard tone="blue" label="Нийт бараа" value={stats ? nf(stats.total) : ""} loading={!stats} />
        <StatCard tone="green" label="Нийтэлсэн" value={stats ? nf(stats.published) : ""} loading={!stats} />
        <StatCard tone="orange" label="Ноорог" value={stats ? nf(stats.draft) : ""} loading={!stats} />
      </StatGrid>

      {/* Per-category */}
      <Panel title="Ангиллаар">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Ангилал</Table.HeaderCell>
              <Table.HeaderCell>Handle</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Бараа</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(stats?.categories || []).map(c => (
              <Table.Row key={c.id}>
                <Table.Cell>{c.name}</Table.Cell>
                <Table.Cell className="font-mono text-xs text-ui-fg-subtle">{c.handle}</Table.Cell>
                <Table.Cell className="text-right"><Badge size="2xsmall">{nf(c.count)}</Badge></Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Panel>

      {/* Import */}
      {canWrite && (
      <div className="px-6 py-4">
        <Text weight="plus" size="small" className="mb-1">CSV импорт</Text>
        <Text className="text-ui-fg-subtle mb-3" size="xsmall">
          Багана: <span className="font-mono">handle,title,price,category,sizes,image,description</span>.
          Байгаа handle-ийг алгасна (давхардуулахгүй).
        </Text>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="mb-3 block text-sm"
          onChange={e => onFile(e.target.files?.[0])}
        />
        <Textarea
          placeholder={"handle,title,price,category,sizes,image,description\nlipstick-1,NARAN Lip 1,45000,makeup,Nude,,Тайлбар"}
          value={csv}
          onChange={e => setCsv(e.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
        <div className="mt-3">
          <Button variant="primary" onClick={runImport} isLoading={importing} disabled={!csv.trim()}>
            Импортлох
          </Button>
        </div>
      </div>
      )}

      {/* Low stock */}
      <Panel
        title="Бага нөөц"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-ui-border-base">
              {[5, 10, 20].map(t => (
                <button key={t} type="button" onClick={() => setThreshold(t)}
                  className={`px-2.5 py-1 txt-compact-small ${threshold === t ? "bg-ui-bg-base-pressed font-medium" : "bg-ui-bg-subtle text-ui-fg-muted hover:bg-ui-bg-subtle-hover"}`}>≤{t}</button>
              ))}
            </div>
            <Badge color={lowStock.length ? "red" : "green"} size="2xsmall">{nf(lowStock.length)}</Badge>
          </div>
        }
      >
        {lowStock.length === 0 ? (
          <EmptyState title={`Бага нөөцтэй бараа алга (≤${threshold})`} hint="Бүх хувилбар хангалттай нөөцтэй байна." />
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Бараа</Table.HeaderCell>
                <Table.HeaderCell>SKU</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Нөөц</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {lowStock.map(v => (
                <Table.Row key={v.sku}>
                  <Table.Cell>{v.product} <span className="text-ui-fg-subtle">· {v.variant}</span></Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-subtle">{v.sku}</Table.Cell>
                  <Table.Cell className="text-right">
                    <Badge color={v.stock === 0 ? "red" : "orange"} size="2xsmall">{v.stock}</Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Panel>

      {/* Bulk stock update */}
      {canWrite && (
      <div className="px-6 py-4">
        <Text weight="plus" size="small" className="mb-1">Нөөц шинэчлэх (CSV)</Text>
        <Text className="text-ui-fg-subtle mb-3" size="xsmall">
          Багана: <span className="font-mono">handle,stock</span> (бүх хувилбар) эсвэл <span className="font-mono">sku,stock</span> (нэг хувилбар).
        </Text>
        <Textarea
          placeholder={"handle,stock\nglow-serum,50"}
          value={stockCsv}
          onChange={e => setStockCsv(e.target.value)}
          rows={4}
          className="font-mono text-xs"
        />
        <div className="mt-3 flex items-center gap-3">
          <Input
            placeholder="Тохируулгын шалтгаан (ж: татан авалт, тооллого)"
            value={stockReason}
            onChange={e => setStockReason(e.target.value)}
            className="max-w-[360px]"
          />
          <Button variant="secondary" onClick={runStock} isLoading={savingStock} disabled={!stockCsv.trim()}>
            Нөөц шинэчлэх
          </Button>
        </div>
      </div>
      )}

      {/* Stock movement history (A-15) */}
      <Panel
        title="Нөөцийн хөдөлгөөний түүх"
        actions={<Badge size="2xsmall" color="grey">{nf(history.length)}</Badge>}
      >
        {history.length === 0 ? (
          <EmptyState title="Хөдөлгөөн бүртгэгдээгүй байна" hint="Нөөц шинэчлэх бүрт өөрчлөлт энд бүртгэгдэнэ." />
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Хэзээ</Table.HeaderCell>
                <Table.HeaderCell>SKU</Table.HeaderCell>
                <Table.HeaderCell>Бараа</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Өөрчлөлт</Table.HeaderCell>
                <Table.HeaderCell>Шалтгаан</Table.HeaderCell>
                <Table.HeaderCell>Хэн</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {history.slice(0, 100).map((h, i) => (
                <Table.Row key={i}>
                  <Table.Cell className="text-ui-fg-subtle text-xs whitespace-nowrap">{new Date(h.at).toLocaleString("mn-MN")}</Table.Cell>
                  <Table.Cell className="font-mono text-xs">{h.sku}</Table.Cell>
                  <Table.Cell className="text-xs">{h.product}</Table.Cell>
                  <Table.Cell className="text-right">
                    <span className="text-ui-fg-subtle">{h.from}→{h.to}</span>{" "}
                    <Badge size="2xsmall" color={h.delta >= 0 ? "green" : "red"}>{h.delta >= 0 ? "+" : ""}{h.delta}</Badge>
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle">{h.reason || "—"}</Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle">{h.actor}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Panel>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Каталог",
  icon: Tag,
});

export default CatalogPage;
