import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ChartBar } from "@medusajs/icons";
import { Container, Text, Table, Button, Input, Label, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, StatGrid, StatCard, Panel, Bar, AreaChart } from "../../lib/ui";

type StaffSales = {
  id: string; name: string; email: string;
  revenue: number; orders: number; items: number; aov: number; discount: number;
  byPayment: Record<string, number>; lastSaleAt: string | null;
};
type Report = {
  from: string | null; to: string | null; staff: string | null;
  totals: { revenue: number; orders: number; aov: number; net: number; vat: number };
  channels: { pos: { revenue: number; orders: number }; online: { revenue: number; orders: number } };
  byStaff: StaffSales[];
  daily: { date: string; revenue: number; orders: number }[];
  byCategory: { name: string; revenue: number; qty: number }[];
  byProduct: { name: string; revenue: number; qty: number }[];
  scanned: number; capped: boolean;
};

const PAY_LABEL: Record<string, string> = {
  cash: "Бэлэн", qpay: "QPay", card: "Карт", transfer: "Шилжүүлэг",
};

async function adminFetch(path: string) {
  const res = await fetch(`/admin${path}`, { credentials: "include", headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

const nf = (n: number) => new Intl.NumberFormat("mn-MN").format(Math.round(n || 0));
const tug = (n: number) => `₮${nf(n)}`;

const ReportsPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [staff, setStaff] = useState("");

  const qs = (over?: { staff?: string }) => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const s = over?.staff !== undefined ? over.staff : staff;
    if (s) p.set("staff", s);
    return p.toString();
  };

  const load = async (over?: { staff?: string }) => {
    setLoading(true);
    try {
      const q = qs(over);
      setData(await adminFetch(`/reports/sales${q ? `?${q}` : ""}`));
    } catch (e: any) {
      toast.error(e.message || "Тайлан ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Clicking a cashier row drills the whole report into their till, and
  // clicking the active one clears it again.
  const pickStaff = (id: string) => {
    const next = staff === id ? "" : id;
    setStaff(next);
    load({ staff: next });
  };

  const exportCsv = (type: string) => {
    const p = new URLSearchParams(qs());
    p.set("type", type);
    window.open(`/admin/reports/sales/export?${p.toString()}`, "_blank");
  };

  if (!permLoading && !can("reports.read")) {
    return <AccessDenied title="Тайлан" perm="reports.read" />;
  }

  const maxDay = Math.max(1, ...(data?.daily || []).map((d) => d.revenue));
  const maxStaff = Math.max(1, ...(data?.byStaff || []).map((s) => s.revenue));
  const activeStaff = (data?.byStaff || []).find((s) => s.id === staff) || null;

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Борлуулалтын тайлан"
        description="Хугацаа, ангилал, бараагаар. НӨАТ (10%) задаргаатай."
      />

      {/* Date range */}
      <div className="flex flex-wrap items-end gap-3 px-6 py-3">
        <div className="flex flex-col gap-1">
          <Label size="small">Эхлэх</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex flex-col gap-1">
          <Label size="small">Дуусах</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
        </div>
        <Button variant="primary" size="small" onClick={() => load()} isLoading={loading}>Тайлагнах</Button>
        {(from || to) && <Button variant="transparent" size="small" onClick={() => { setFrom(""); setTo(""); }}>Цэвэрлэх</Button>}
        {data?.capped && <Text className="text-ui-fg-subtle" size="xsmall">(эхний {nf(data.scanned)} захиалгаар хязгаарласан)</Text>}
      </div>

      {/* Which cashier the figures below belong to. */}
      {activeStaff && (
        <div className="flex flex-wrap items-center gap-2 bg-ui-bg-subtle px-6 py-2">
          <Text size="small" weight="plus">Шүүлт: {activeStaff.name}</Text>
          <Text className="text-ui-fg-subtle" size="xsmall">— доорх бүх тоо зөвхөн энэ ажилтны кассын борлуулалт.</Text>
          <Button variant="transparent" size="small" onClick={() => pickStaff(activeStaff.id)}>Болих</Button>
        </div>
      )}

      {/* Totals */}
      <StatGrid cols={5}>
        <StatCard label="Нийт борлуулалт" value={data ? tug(data.totals.revenue) : "…"} loading={loading} tone="green" />
        <StatCard label="НӨАТгүй (net)" value={data ? tug(data.totals.net) : "…"} loading={loading} tone="green" />
        <StatCard label="НӨАТ (10%)" value={data ? tug(data.totals.vat) : "…"} loading={loading} tone="orange" />
        <StatCard label="Захиалга" value={data ? nf(data.totals.orders) : "…"} loading={loading} tone="blue" />
        <StatCard label="Дундаж захиалга" value={data ? tug(data.totals.aov) : "…"} loading={loading} tone="orange" />
      </StatGrid>

      {/* Till vs storefront, then the per-cashier breakdown. */}
      <StatGrid cols={2}>
        <StatCard
          label={`Кассаар (POS) · ${data ? nf(data.channels.pos.orders) : "…"} гүйлгээ`}
          value={data ? tug(data.channels.pos.revenue) : "…"} loading={loading} tone="green"
        />
        <StatCard
          label={`Онлайнаар · ${data ? nf(data.channels.online.orders) : "…"} захиалга`}
          value={data ? tug(data.channels.online.revenue) : "…"} loading={loading} tone="blue"
        />
      </StatGrid>

      {/* By cashier. Always covers every till sale in the date range, even when
          the report above is filtered — otherwise choosing a cashier would
          empty the list you chose them from. */}
      <Panel
        title="Ажилтнаар (кассын борлуулалт)"
        actions={<Button variant="secondary" size="small" onClick={() => exportCsv("staff")}>CSV</Button>}
      >
        {(data?.byStaff || []).length === 0 ? (
          <div className="p-4"><Text className="text-ui-fg-subtle" size="small">Энэ хугацаанд кассаар бүртгэсэн борлуулалт алга.</Text></div>
        ) : (
          <Table>
            <Table.Header><Table.Row>
              <Table.HeaderCell>Ажилтан</Table.HeaderCell>
              <Table.HeaderCell>Хувь</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Гүйлгээ</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Ширхэг</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Дундаж</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Хямдрал</Table.HeaderCell>
              <Table.HeaderCell>Төлбөр</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Борлуулалт</Table.HeaderCell>
            </Table.Row></Table.Header>
            <Table.Body>
              {data!.byStaff.map((s) => (
                <Table.Row
                  key={s.id}
                  onClick={() => pickStaff(s.id)}
                  className={`cursor-pointer ${s.id === staff ? "bg-ui-bg-highlight" : ""}`}
                >
                  <Table.Cell>
                    <div className="font-medium">{s.name}</div>
                    {s.email && <div className="text-ui-fg-subtle text-xs">{s.email}</div>}
                  </Table.Cell>
                  <Table.Cell className="w-[140px]"><Bar value={s.revenue} max={maxStaff} tone="interactive" /></Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{nf(s.orders)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{nf(s.items)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{tug(s.aov)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{s.discount ? `−${tug(s.discount)}` : "—"}</Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle text-xs">
                    {Object.entries(s.byPayment)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => `${PAY_LABEL[k] || k} ${tug(v)}`)
                      .join(" · ") || "—"}
                  </Table.Cell>
                  <Table.Cell className="text-right font-medium tabular-nums">{tug(s.revenue)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Panel>

      {/* Daily trend */}
      <Panel
        title="Өдрийн борлуулалт"
        actions={<Button variant="secondary" size="small" onClick={() => exportCsv("daily")}>CSV</Button>}
        bodyClassName="p-4"
      >
        {(data?.daily || []).length === 0 ? (
          <Text className="text-ui-fg-subtle" size="small">Мэдээлэл алга.</Text>
        ) : (
          <div className="flex flex-col gap-4">
            <AreaChart
              points={data!.daily.map((d) => ({ label: d.date.slice(5), value: d.revenue }))}
              height={96}
              tone="interactive"
              valueFormat={tug}
            />
            <div className="flex flex-col gap-1">
            {data!.daily.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-xs text-ui-fg-subtle w-24 shrink-0">{d.date}</span>
                <Bar value={d.revenue} max={maxDay} tone="interactive" className="flex-1" />
                <span className="text-xs font-medium w-24 text-right shrink-0 tabular-nums">{tug(d.revenue)}</span>
                <span className="text-xs text-ui-fg-subtle w-10 text-right shrink-0 tabular-nums">{nf(d.orders)}</span>
              </div>
            ))}
            </div>
          </div>
        )}
      </Panel>

      {/* By category */}
      <Panel
        title="Ангиллаар"
        actions={<Button variant="secondary" size="small" onClick={() => exportCsv("category")}>CSV</Button>}
      >
        <Table>
          <Table.Header><Table.Row>
            <Table.HeaderCell>Ангилал</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Тоо</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Борлуулалт</Table.HeaderCell>
          </Table.Row></Table.Header>
          <Table.Body>
            {(data?.byCategory || []).map((c) => (
              <Table.Row key={c.name}>
                <Table.Cell>{c.name}</Table.Cell>
                <Table.Cell className="text-right tabular-nums">{nf(c.qty)}</Table.Cell>
                <Table.Cell className="text-right font-medium tabular-nums">{tug(c.revenue)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Panel>

      {/* By product */}
      <Panel
        title="Бараагаар (топ 50)"
        actions={<Button variant="secondary" size="small" onClick={() => exportCsv("product")}>CSV</Button>}
      >
        <Table>
          <Table.Header><Table.Row>
            <Table.HeaderCell>Бараа</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Тоо</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Борлуулалт</Table.HeaderCell>
          </Table.Row></Table.Header>
          <Table.Body>
            {(data?.byProduct || []).map((p) => (
              <Table.Row key={p.name}>
                <Table.Cell>{p.name}</Table.Cell>
                <Table.Cell className="text-right tabular-nums">{nf(p.qty)}</Table.Cell>
                <Table.Cell className="text-right font-medium tabular-nums">{tug(p.revenue)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Panel>

      {/* VAT report (10% VAT-inclusive breakdown for accounting) */}
      <Panel
        title="НӨАТ тайлан"
        actions={<Button variant="secondary" size="small" onClick={() => exportCsv("vat")}>CSV</Button>}
        bodyClassName="p-4"
      >
        <Text className="text-ui-fg-subtle" size="xsmall">Үнэ НӨАТ багтсан (Монгол, 10%). Нийт {data ? tug(data.totals.revenue) : "…"} = НӨАТгүй {data ? tug(data.totals.net) : "…"} + НӨАТ {data ? tug(data.totals.vat) : "…"}.</Text>
      </Panel>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Тайлан",
  icon: ChartBar,
});

export default ReportsPage;
