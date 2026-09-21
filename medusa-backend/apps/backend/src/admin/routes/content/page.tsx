import { defineRouteConfig } from "@medusajs/admin-sdk";
import { DocumentText } from "@medusajs/icons";
import { Container, Text, Button, Input, Textarea, Label, Switch, IconButton, toast } from "@medusajs/ui";
import { Trash, Plus, ArrowUpMini, ArrowDownMini, Photo, ArrowUpTray } from "@medusajs/icons";
import { useEffect, useRef, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader } from "../../lib/ui";

type Bi = { mn: string; en: string };
type Slide = { kicker: Bi; top: Bi; accent: Bi; desc: Bi; img: string; href: string };
type Promo = { enabled: boolean; kicker: Bi; title: Bi; desc: Bi; cta: Bi; href: string; img: string };
type Content = { hero: Slide[]; promo: Promo };

const emptyBi = (): Bi => ({ mn: "", en: "" });
const emptySlide = (): Slide => ({ kicker: emptyBi(), top: emptyBi(), accent: emptyBi(), desc: emptyBi(), img: "", href: "/shop" });

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// Upload a picture to Medusa's file provider (local in dev, R2/S3 in prod) and
// return its public URL. Uses the built-in admin uploads endpoint — no extra
// backend needed. NOTE: don't set content-type; the browser adds the multipart
// boundary, and the field name must be "files" (router uses .array("files")).
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("files", file);
  const res = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any)?.message || `Байршуулах амжилтгүй (${res.status})`);
  }
  const j = await res.json();
  const url = j?.files?.[0]?.url;
  if (!url) throw new Error("URL буцаж ирсэнгүй");
  return url;
}

// Image control: a live thumbnail + a URL field (paste a hosted link) + an
// "upload" button that sends a local file to the store's file provider and fills
// the URL in automatically. So a non-technical owner can just pick a photo.
const ImageField = ({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) => {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(file)); toast.success("Зураг орууллаа"); }
    catch (e: any) { toast.error(e.message || "Зураг оруулж чадсангүй"); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-1">
      <Label size="small">{label}</Label>
      <div className="flex items-start gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-subtle">
          {value
            ? <img src={value} alt="" className="h-full w-full object-cover" />
            : <Photo className="text-ui-fg-muted" />}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… эсвэл доороос оруулна уу" />
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { pick(e.target.files?.[0]); if (e.currentTarget) e.currentTarget.value = ""; }} />
            <Button variant="secondary" size="small" isLoading={busy} onClick={() => fileRef.current?.click()}>
              <ArrowUpTray /> Зураг оруулах
            </Button>
            {value && !busy && (
              <Button variant="transparent" size="small" onClick={() => onChange("")}>Хасах</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// A bilingual field: MN + EN inputs side by side.
const BiField = ({ label, value, onChange, textarea }: { label: string; value: Bi; onChange: (v: Bi) => void; textarea?: boolean }) => {
  const C = textarea ? Textarea : Input;
  return (
    <div className="flex flex-col gap-1">
      <Label size="small">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <C value={value.mn} onChange={(e: any) => onChange({ ...value, mn: e.target.value })} placeholder="Монгол" {...(textarea ? { rows: 2 } : {})} />
        <C value={value.en} onChange={(e: any) => onChange({ ...value, en: e.target.value })} placeholder="English" {...(textarea ? { rows: 2 } : {})} />
      </div>
    </div>
  );
};

const ContentPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch("/cms/homepage")
      .then((j) => setContent(j.content))
      .catch((e) => toast.error(e.message || "Ачаалж чадсангүй"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!content) return;
    setSaving(true);
    try {
      const { live } = await adminFetch("/cms/homepage", { method: "POST", body: JSON.stringify({ content }) });
      if (live) toast.success("Хадгаллаа — сайтад шууд гарлаа");
      else toast.success("Хадгаллаа — сайтад хэдэн минутын дотор тусгагдана");
    } catch (e: any) {
      toast.error(e.message || "Хадгалах амжилтгүй");
    } finally {
      setSaving(false);
    }
  };

  const setSlide = (i: number, patch: Partial<Slide>) =>
    setContent((c) => c && ({ ...c, hero: c.hero.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, dir: -1 | 1) =>
    setContent((c) => {
      if (!c) return c;
      const j = i + dir;
      if (j < 0 || j >= c.hero.length) return c;
      const hero = [...c.hero];
      [hero[i], hero[j]] = [hero[j], hero[i]];
      return { ...c, hero };
    });

  if (!permLoading && !can("content.write")) {
    return <AccessDenied title="Контент" perm="content.write" />;
  }
  if (loading || !content) {
    return <Container className="p-6"><Text className="text-ui-fg-subtle">Ачаалж байна…</Text></Container>;
  }

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Контент — Нүүр хуудас"
        description="Hero слайд ба урамшууллын баннерыг MN/EN-ээр удирдана."
        actions={<Button variant="primary" onClick={save} isLoading={saving}>Хадгалах</Button>}
      />

      {/* Hero slides */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <Text weight="plus" size="small">Hero слайдууд ({content.hero.length})</Text>
          <Button variant="secondary" size="small" onClick={() => setContent((c) => c && ({ ...c, hero: [...c.hero, emptySlide()] }))}>
            <Plus /> Слайд нэмэх
          </Button>
        </div>
        {content.hero.length === 0 && (
          <Text className="text-ui-fg-subtle" size="small">Слайд алга — нүүр хуудас өгөгдмөл (default) хувилбарыг харуулна.</Text>
        )}
        <div className="flex flex-col gap-5">
          {content.hero.map((s, i) => (
            <div key={i} className="rounded-lg border border-ui-border-base p-4">
              <div className="flex items-center justify-between mb-3">
                <Text weight="plus" size="small">Слайд {i + 1}</Text>
                <div className="flex items-center gap-1">
                  <IconButton size="small" variant="transparent" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpMini /></IconButton>
                  <IconButton size="small" variant="transparent" disabled={i === content.hero.length - 1} onClick={() => move(i, 1)}><ArrowDownMini /></IconButton>
                  <IconButton size="small" variant="transparent" onClick={() => setContent((c) => c && ({ ...c, hero: c.hero.filter((_, idx) => idx !== i) }))}><Trash /></IconButton>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <BiField label="Kicker (жижиг гарчиг)" value={s.kicker} onChange={(v) => setSlide(i, { kicker: v })} />
                <BiField label="Гол мөр" value={s.top} onChange={(v) => setSlide(i, { top: v })} />
                <BiField label="Онцлох үг (accent)" value={s.accent} onChange={(v) => setSlide(i, { accent: v })} />
                <BiField label="Тайлбар" value={s.desc} onChange={(v) => setSlide(i, { desc: v })} textarea />
                <ImageField label="Зураг" value={s.img} onChange={(url) => setSlide(i, { img: url })} />
                <div className="flex flex-col gap-1">
                  <Label size="small">Холбоос</Label>
                  <Input value={s.href} onChange={(e) => setSlide(i, { href: e.target.value })} placeholder="/shop" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Promo banner */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Text weight="plus" size="small">Урамшууллын баннер</Text>
          <Switch checked={content.promo.enabled} onCheckedChange={(v) => setContent((c) => c && ({ ...c, promo: { ...c.promo, enabled: v } }))} />
          <Text className="text-ui-fg-subtle" size="xsmall">{content.promo.enabled ? "Идэвхтэй" : "Идэвхгүй"}</Text>
        </div>
        <div className="flex flex-col gap-3">
          <BiField label="Kicker" value={content.promo.kicker} onChange={(v) => setContent((c) => c && ({ ...c, promo: { ...c.promo, kicker: v } }))} />
          <BiField label="Гарчиг" value={content.promo.title} onChange={(v) => setContent((c) => c && ({ ...c, promo: { ...c.promo, title: v } }))} />
          <BiField label="Тайлбар" value={content.promo.desc} onChange={(v) => setContent((c) => c && ({ ...c, promo: { ...c.promo, desc: v } }))} textarea />
          <BiField label="Товчны текст" value={content.promo.cta} onChange={(v) => setContent((c) => c && ({ ...c, promo: { ...c.promo, cta: v } }))} />
          <ImageField label="Зураг (хоосон бол өгөгдмөл)" value={content.promo.img} onChange={(url) => setContent((c) => c && ({ ...c, promo: { ...c.promo, img: url } }))} />
          <div className="flex flex-col gap-1">
            <Label size="small">Холбоос</Label>
            <Input value={content.promo.href} onChange={(e) => setContent((c) => c && ({ ...c, promo: { ...c.promo, href: e.target.value } }))} placeholder="/shop?filter=sale" />
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        <Button variant="primary" onClick={save} isLoading={saving}>Хадгалах</Button>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Контент",
  icon: DocumentText,
});

export default ContentPage;
