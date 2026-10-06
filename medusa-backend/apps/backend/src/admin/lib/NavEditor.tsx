import { Text, Button, Input, Label, Switch, IconButton, Select, Badge, toast } from "@medusajs/ui";
import { Trash, Plus, ArrowUpMini, ArrowDownMini } from "@medusajs/icons";
import { useEffect, useState } from "react";

type Bi = { mn: string; en: string };
export type NavItem = {
  id: string;
  label: Bi;
  href: string;
  i18nKey?: string;
  category_id?: string;
  enabled: boolean;
};
type Cat = { id: string; name: string; handle: string };

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// The audience filters the storefront understands natively (no category needed).
const PRESETS: { value: string; label: string; href: string }[] = [
  { value: "p:men", label: "Эрэгтэй (хэрэглэгч)", href: "/shop?gender=men" },
  { value: "p:women", label: "Эмэгтэй (хэрэглэгч)", href: "/shop?gender=women" },
  { value: "p:new", label: "Шинэ ирсэн", href: "/shop?sort=new" },
  { value: "p:gift", label: "Бэлгийн багц", href: "/shop?gender=gift" },
  { value: "p:all", label: "Бүх бараа", href: "/shop" },
];

const slugId = () => `i${Math.random().toString(36).slice(2, 8)}`;

// Which option in the target dropdown an item currently matches.
const targetOf = (it: NavItem): string => {
  if (it.category_id) return `c:${it.category_id}`;
  const p = PRESETS.find((x) => x.href === it.href);
  return p ? p.value : "custom";
};

export const NavEditor = () => {
  const [items, setItems] = useState<NavItem[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);

  const loadCats = () =>
    adminFetch("/product-categories?limit=100&fields=id,name,handle")
      .then((j) => setCats((j.product_categories || []).map((c: any) => ({ id: c.id, name: c.name, handle: c.handle }))))
      .catch(() => setCats([]));

  useEffect(() => {
    adminFetch("/cms/nav")
      .then((j) => setItems(j.items || []))
      .catch((e) => toast.error(e.message || "Цэс ачаалж чадсангүй"));
    loadCats();
  }, []);

  const patch = (i: number, p: Partial<NavItem>) =>
    setItems((xs) => xs && xs.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((xs) => {
      if (!xs) return xs;
      const j = i + dir;
      if (j < 0 || j >= xs.length) return xs;
      const out = [...xs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });

  // Picking a target rewrites the item's href. A built-in label (i18nKey) is
  // dropped once the owner repoints or renames the item, otherwise the
  // storefront would keep showing the old translated word.
  const setTarget = async (i: number, value: string) => {
    const it = items?.[i];
    if (!it) return;
    if (value === "new") {
      const name = (it.label.mn || it.label.en).trim();
      if (!name) {
        toast.error("Эхлээд цэсний нэрийг бичнэ үү");
        return;
      }
      setCreating(i);
      try {
        const { product_category: c, created } = await adminFetch("/catalog/categories", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        await loadCats();
        patch(i, { category_id: c.id, href: `/shop?category=${c.handle}`, i18nKey: undefined });
        toast.success(created ? `"${c.name}" ангилал үүслээ` : `"${c.name}" ангилал аль хэдийн байна — холболоо`);
      } catch (e: any) {
        toast.error(e.message || "Ангилал үүсгэж чадсангүй");
      } finally {
        setCreating(null);
      }
      return;
    }
    if (value.startsWith("c:")) {
      const c = cats.find((x) => x.id === value.slice(2));
      if (c) patch(i, { category_id: c.id, href: `/shop?category=${c.handle}`, i18nKey: undefined });
      return;
    }
    const p = PRESETS.find((x) => x.value === value);
    if (p) patch(i, { category_id: undefined, href: p.href, i18nKey: undefined });
  };

  const save = async () => {
    if (!items) return;
    setSaving(true);
    try {
      const { live } = await adminFetch("/cms/nav", { method: "POST", body: JSON.stringify({ items }) });
      toast.success(live ? "Цэс хадгалагдлаа — сайтад шууд гарлаа" : "Цэс хадгалагдлаа — хэдэн минутын дотор тусгагдана");
    } catch (e: any) {
      toast.error(e.message || "Хадгалах амжилтгүй");
    } finally {
      setSaving(false);
    }
  };

  if (!items) return <Text className="text-ui-fg-subtle" size="small">Ачаалж байна…</Text>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Text weight="plus" size="small">Сайтын цэс ({items.length})</Text>
          <Text className="text-ui-fg-subtle" size="xsmall">
            Толгой хэсэг болон хөлний «Ангилал» баганад харагдана. Шинэ цэс нэмээд «Шинэ ангилал үүсгэх» сонговол
            тухайн цэс жинхэнэ ангилал болж, «Бөөнөөр засах» хуудаснаас бараа нэмэх боломжтой болно.
          </Text>
        </div>
        <Button
          variant="secondary"
          size="small"
          className="shrink-0"
          onClick={() =>
            setItems((xs) => xs && [...xs, { id: slugId(), label: { mn: "", en: "" }, href: "/shop", enabled: true }])
          }
        >
          <Plus /> Цэс нэмэх
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((it, i) => {
          const cat = it.category_id ? cats.find((c) => c.id === it.category_id) : undefined;
          return (
            <div key={it.id} className="rounded-lg border border-ui-border-base p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Text weight="plus" size="small">{it.label.mn || it.label.en || `Цэс ${i + 1}`}</Text>
                  {cat && <Badge size="2xsmall">ангилал: {cat.name}</Badge>}
                  {!it.enabled && <Badge size="2xsmall" color="grey">нуусан</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={it.enabled} onCheckedChange={(v) => patch(i, { enabled: v })} />
                  <IconButton size="small" variant="transparent" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpMini /></IconButton>
                  <IconButton size="small" variant="transparent" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDownMini /></IconButton>
                  <IconButton size="small" variant="transparent" onClick={() => setItems((xs) => xs && xs.filter((_, idx) => idx !== i))}><Trash /></IconButton>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label size="small">Нэр (Монгол)</Label>
                  <Input
                    value={it.label.mn}
                    placeholder="Бусад"
                    onChange={(e) => patch(i, { label: { ...it.label, mn: e.target.value }, i18nKey: undefined })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label size="small">Нэр (English)</Label>
                  <Input
                    value={it.label.en}
                    placeholder="Other"
                    onChange={(e) => patch(i, { label: { ...it.label, en: e.target.value }, i18nKey: undefined })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label size="small">Хаашаа очих</Label>
                  <Select size="small" value={targetOf(it)} onValueChange={(v) => setTarget(i, v)} disabled={creating === i}>
                    <Select.Trigger><Select.Value placeholder="Сонгох" /></Select.Trigger>
                    <Select.Content>
                      {PRESETS.map((p) => <Select.Item key={p.value} value={p.value}>{p.label}</Select.Item>)}
                      {cats.map((c) => <Select.Item key={c.id} value={`c:${c.id}`}>Ангилал — {c.name}</Select.Item>)}
                      <Select.Item value="new">＋ Шинэ ангилал үүсгэх</Select.Item>
                      {targetOf(it) === "custom" && <Select.Item value="custom">Гараар бичсэн холбоос</Select.Item>}
                    </Select.Content>
                  </Select>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-1">
                <Label size="small">Холбоос</Label>
                <Input value={it.href} onChange={(e) => patch(i, { href: e.target.value })} placeholder="/shop?category=busad" />
                {cat && (
                  <Text className="text-ui-fg-subtle" size="xsmall">
                    Бараа нэмэх: «Бөөнөөр засах» хуудсанд барааг сонгоод «{cat.name}» ангиллыг нэмнэ.
                  </Text>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <Button variant="primary" size="small" onClick={save} isLoading={saving}>Цэсийг хадгалах</Button>
      </div>
    </div>
  );
};
