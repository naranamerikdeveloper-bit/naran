import { defineRouteConfig } from "@medusajs/admin-sdk";
import { BellAlert } from "@medusajs/icons";
import { Container, Heading, Text, Badge, Button, Table, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, Panel } from "../../lib/ui";

type Item = { key: string; label: string; count: number; tone: string; href: string };
type LowStock = { sku: string; variant: string; product: string; stock: number };

const nf = (n: number) => new Intl.NumberFormat("mn-MN").format(n || 0);

const NotificationsPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [items, setItems] = useState<Item[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/admin/naran-notifications", { credentials: "include", headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error(`(${res.status})`);
      const j = await res.json();
      setItems(j.items || []);
      setLowStock(j.lowStockSample || []);
    } catch (e: any) {
      toast.error("Мэдэгдэл ачаалж чадсангүй " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (!permLoading && !can("orders.read")) {
    return <AccessDenied title="Мэдэгдэл" perm="orders.read" />;
  }

  const toneColor = (tone: string, count: number): "red" | "orange" | "blue" | "green" =>
    tone === "warning" ? (count ? "orange" : "green") : tone === "info" ? "blue" : "green";

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Мэдэгдэл"
        description="Анхаарал шаардсан зүйлс: нөөц, буцаалт, шинэ захиалга."
        actions={<Button variant="secondary" size="small" onClick={load} disabled={loading}>Сэргээх</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ui-border-base">
        {items.map((it) => (
          <a key={it.key} href={it.href} className="bg-ui-bg-base px-6 py-5 hover:bg-ui-bg-base-hover transition-colors">
            <div className="flex items-center justify-between">
              <Text className="text-ui-fg-subtle" size="small">{it.label}</Text>
              <Badge color={toneColor(it.tone, it.count)} size="2xsmall">{nf(it.count)}</Badge>
            </div>
            <Heading level="h2" className="mt-1">{nf(it.count)}</Heading>
          </a>
        ))}
      </div>

      {lowStock.length > 0 && (
        <Panel title="Бага нөөцтэй бараа">
          <Table>
            <Table.Header><Table.Row>
              <Table.HeaderCell>Бараа</Table.HeaderCell>
              <Table.HeaderCell>SKU</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Нөөц</Table.HeaderCell>
            </Table.Row></Table.Header>
            <Table.Body>
              {lowStock.map((v) => (
                <Table.Row key={v.sku}>
                  <Table.Cell>{v.product} <span className="text-ui-fg-subtle">· {v.variant}</span></Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-subtle">{v.sku}</Table.Cell>
                  <Table.Cell className="text-right"><Badge color={v.stock === 0 ? "red" : "orange"} size="2xsmall">{v.stock}</Badge></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Panel>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Мэдэгдэл",
  icon: BellAlert,
});

export default NotificationsPage;
