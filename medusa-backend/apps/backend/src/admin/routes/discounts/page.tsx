import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ReceiptPercent } from "@medusajs/icons";
import { Container, Text, Button, Input, Label, Select, Badge, Table, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, Panel, EmptyState } from "../../lib/ui";

/**
 * Discount codes (spec A-20+). Codes created here work in BOTH places: the
 * storefront checkout (shoppers type them at payment) and the POS (the cashier
 * applies one at the till) — there is a single source of truth, Medusa's own
 * promotions, so usage and reporting stay consistent.
 *
 * Optional expiry / usage limit are expressed as a Medusa campaign attached to
 * the promotion; without them the code is simply open-ended.
 */

type Promo = { id: string; code: string; automatic: boolean; status: string; type: string; value: number | null; currency: string | null; used: number };

const CURRENCY = "mnt";
const nf = (n: number) => new Intl.NumberFormat("mn-MN").format(n || 0);

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
  return res.status === 204 ? null : res.json();
}

// Readable, unambiguous code (no O/0/I/1 mix-ups when read off a receipt).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () =>
  "NARAN" + Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

const DiscountsPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // New-code form
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [limit, setLimit] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const j = await adminFetch("/marketing/promotions");
      setPromos(j?.promotions || []);
    } catch (e: any) {
      toast.error(e.message || "Кодууд ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (!permLoading && !can("promotions.write")) {
    return <AccessDenied title="Хямдралын код" perm="promotions.write" />;
  }

  const create = async () => {
    const c = code.trim().toUpperCase();
    const v = Number(value);
    if (!c) { toast.error("Код оруулна уу"); return; }
    if (!Number.isFinite(v) || v <= 0) { toast.error("Утга буруу байна"); return; }
    if (kind === "percentage" && v > 100) { toast.error("Хувь 100-аас их байж болохгүй"); return; }

    setBusy(true);
    try {
      // Expiry / usage limit live on a campaign — only create one if asked for.
      let campaign_id: string | undefined;
      if (endsAt || limit.trim()) {
        const lim = Math.max(0, Math.round(Number(limit) || 0));
        const campaign = await adminFetch("/campaigns", {
          method: "POST",
          body: JSON.stringify({
            name: `${c} — хямдрал`,
            campaign_identifier: c,
            currency_code: CURRENCY,
            ...(endsAt ? { ends_at: new Date(endsAt).toISOString() } : {}),
            ...(lim > 0 ? { budget: { type: "usage", limit: lim } } : {}),
          }),
        });
        campaign_id = campaign?.campaign?.id;
      }

      await adminFetch("/promotions", {
        method: "POST",
        body: JSON.stringify({
          code: c,
          type: "standard",
          status: "active",
          application_method: {
            type: kind,
            target_type: "order",
            allocation: "across",
            value: v,
            ...(kind === "fixed" ? { currency_code: CURRENCY } : {}),
          },
          ...(campaign_id ? { campaign_id } : {}),
        }),
      });

      toast.success(`Код үүслээ: ${c}`);
      setCode(""); setValue(""); setEndsAt(""); setLimit("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Код үүсгэж чадсангүй");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (p: Promo, status: "active" | "inactive") => {
    try {
      await adminFetch(`/promotions/${p.id}`, { method: "POST", body: JSON.stringify({ status }) });
      toast.success(status === "active" ? `${p.code} идэвхжлээ` : `${p.code} унтраалаа`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Төлөв солиход алдаа гарлаа");
    }
  };

  const remove = async (p: Promo) => {
    if (!confirm(`${p.code} кодыг устгах уу? Буцаах боломжгүй.`)) return;
    try {
      await adminFetch(`/promotions/${p.id}`, { method: "DELETE" });
      toast.success(`${p.code} устлаа`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Устгаж чадсангүй");
    }
  };

  const fmtValue = (p: Promo) =>
    p.value == null ? "—" : p.type === "percentage" ? `${p.value}%` : `₮${nf(p.value)}`;

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Хямдралын код"
        description="Энд үүсгэсэн код нь онлайн худалдан авалт (checkout) болон кассын систем (POS) хоёуланд ажиллана."
        actions={<Button variant="secondary" size="small" onClick={load} isLoading={loading}>Сэргээх</Button>}
      />

      {/* Create */}
      <Panel title="Шинэ код үүсгэх" bodyClassName="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label size="small">Код</Label>
            <div className="flex items-center gap-2">
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                placeholder="NARAN10" className="w-[180px]" />
              <Button variant="secondary" size="small" onClick={() => setCode(randomCode())}>Үүсгэх</Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label size="small">Төрөл</Label>
            <div className="w-[150px]">
              <Select size="small" value={kind} onValueChange={(v) => setKind(v as any)}>
                <Select.Trigger><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="percentage">Хувь (%)</Select.Item>
                  <Select.Item value="fixed">Дүн (₮)</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label size="small">{kind === "percentage" ? "Хэдэн хувь" : "Хэдэн төгрөг"}</Label>
            <Input value={value} onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={kind === "percentage" ? "10" : "20000"} className="w-[130px]" inputMode="numeric" />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="small">Дуусах (заавал биш)</Label>
            <Input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-[160px]" />
          </div>

          <div className="flex flex-col gap-1">
            <Label size="small">Хэрэглэх хязгаар</Label>
            <Input value={limit} onChange={e => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Хязгааргүй" className="w-[130px]" inputMode="numeric" />
          </div>

          <Button variant="primary" onClick={create} isLoading={busy} disabled={!code.trim() || !value.trim()}>
            Код үүсгэх
          </Button>
        </div>
        <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
          Хугацаа эсвэл хэрэглэх хязгаар оруулбал кампанит ажил үүсч, хязгаарт хүрмэгц код автоматаар ажиллахаа болино.
        </Text>
      </Panel>

      {/* List */}
      <Panel title="Кодууд" actions={<Badge size="2xsmall" color="grey">{nf(promos.length)}</Badge>}>
        {promos.length === 0 ? (
          <EmptyState title="Хямдралын код алга" hint="Дээрээс шинэ код үүсгэнэ үү." />
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Код</Table.HeaderCell>
                <Table.HeaderCell>Төрөл</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Утга</Table.HeaderCell>
                <Table.HeaderCell>Төлөв</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Ашигласан</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {promos.map(p => {
                const active = p.status === "active";
                return (
                  <Table.Row key={p.id}>
                    <Table.Cell><span className="font-mono font-medium">{p.code}</span>{p.automatic && <Badge size="2xsmall" className="ml-2">Автомат</Badge>}</Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle">{p.type === "percentage" ? "Хувь" : p.type === "fixed" ? "Дүн" : p.type}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{fmtValue(p)}</Table.Cell>
                    <Table.Cell><Badge size="2xsmall" color={active ? "green" : "grey"}>{active ? "Идэвхтэй" : "Идэвхгүй"}</Badge></Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{nf(p.used)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="small" onClick={() => setStatus(p, active ? "inactive" : "active")}>
                          {active ? "Унтраах" : "Идэвхжүүлэх"}
                        </Button>
                        <Button variant="danger" size="small" onClick={() => remove(p)}>Устгах</Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        )}
      </Panel>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Хямдралын код",
  icon: ReceiptPercent,
});

export default DiscountsPage;
