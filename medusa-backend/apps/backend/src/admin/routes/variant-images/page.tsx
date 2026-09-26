import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Photo } from "@medusajs/icons";
import { Container, Text, Button, Input, Badge, toast } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, Panel, EmptyState } from "../../lib/ui";
import { optimizeImage, uploadImages } from "../../lib/upload";

/**
 * "Хувилбарын зураг" — a photo per size.
 *
 * A 30ml bottle doesn't look like the 150ml one, so each variant can carry its
 * own picture. It lives on `variant.metadata.image`; the storefront swaps the
 * product gallery to it the moment a shopper picks that size. Without one the
 * size simply falls back to the product's own gallery, so this is always
 * optional.
 */

type Variant = { id: string; title: string; sku: string | null; image: string | null };
type Prod = { id: string; title: string; thumbnail: string | null };

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any)?.message || `Request failed (${res.status})`);
  }
  return res.json();
}

const VariantImagesPage = () => {
  const { loading: permLoading, can } = usePermissions();

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Prod[]>([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<Prod | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loadingVars, setLoadingVars] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Debounced product search.
  useEffect(() => {
    let alive = true;
    setSearching(true);
    const h = setTimeout(async () => {
      try {
        const j = await adminFetch(`/catalog/products?limit=20&q=${encodeURIComponent(q)}`);
        if (alive) setResults(j.products || []);
      } catch { if (alive) setResults([]); }
      finally { if (alive) setSearching(false); }
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q]);

  const openProduct = async (p: Prod) => {
    setSel(p);
    setLoadingVars(true);
    setVariants([]);
    try {
      const j = await adminFetch(`/products/${p.id}?fields=id,title,*variants`);
      const vs = (j.product?.variants || []).map((v: any) => ({
        id: v.id,
        title: v.title || "—",
        sku: v.sku || null,
        image: typeof v.metadata?.image === "string" ? v.metadata.image : null,
      }));
      setVariants(vs);
    } catch (e: any) {
      toast.error(e.message || "Хувилбар ачаалж чадсангүй");
    } finally {
      setLoadingVars(false);
    }
  };

  // Merge the one key: Medusa REPLACES variant metadata on update, so the rest
  // of it has to be carried over by hand.
  const saveImage = async (v: Variant, url: string | null) => {
    if (!sel) return;
    setBusy(v.id);
    try {
      const cur = await adminFetch(`/products/${sel.id}/variants/${v.id}?fields=id,metadata`);
      const meta = { ...((cur.variant?.metadata as any) || {}) };
      if (url) meta.image = url; else delete meta.image;
      await adminFetch(`/products/${sel.id}/variants/${v.id}`, {
        method: "POST",
        body: JSON.stringify({ metadata: meta }),
      });
      setVariants(prev => prev.map(x => (x.id === v.id ? { ...x, image: url } : x)));
      toast.success(url ? `${v.title} — зураг хадгалагдлаа` : `${v.title} — зураг хасагдлаа`);
    } catch (e: any) {
      toast.error(e.message || "Хадгалж чадсангүй");
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (v: Variant, file?: File) => {
    if (!file) return;
    setBusy(v.id);
    try {
      const [url] = await uploadImages([await optimizeImage(file)]);
      if (!url) throw new Error("Зураг байршуулж чадсангүй");
      await saveImage(v, url);
    } catch (e: any) {
      toast.error(e.message || "Зураг байршуулж чадсангүй");
      setBusy(null);
    } finally {
      const input = fileRefs.current[v.id];
      if (input) input.value = "";
    }
  };

  if (!permLoading && !can("catalog.write")) {
    return <AccessDenied title="Хувилбарын зураг" perm="catalog.write" />;
  }

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Хувилбарын зураг"
        description="Хэмжээ (30ml, 50ml…) тус бүрд өөр зураг оруулна. Худалдан авагч тухайн хэмжээг сонгоход дэлгүүрт тэр зураг нь харагдана. Оруулаагүй бол барааны үндсэн зураг хэвээр байна."
      />

      {/* Product picker */}
      <Panel title="Бараа сонгох" bodyClassName="p-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Барааны нэрээр хайх…" className="max-w-[420px]" />
        <div className="mt-3 max-h-[260px] overflow-y-auto rounded-lg border border-ui-border-base divide-y divide-ui-border-base">
          {searching && results.length === 0 ? (
            <div className="px-4 py-6 text-center"><Text size="small" className="text-ui-fg-subtle">Хайж байна…</Text></div>
          ) : results.length === 0 ? (
            <EmptyState title="Бараа олдсонгүй" hint="Өөр нэрээр хайж үзнэ үү." />
          ) : (
            results.map(p => (
              <button key={p.id} type="button" onClick={() => openProduct(p)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-fg hover:bg-ui-bg-subtle-hover ${sel?.id === p.id ? "bg-ui-bg-subtle" : ""}`}>
                {p.thumbnail
                  ? <img src={p.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover bg-ui-bg-subtle" />
                  : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ui-bg-subtle text-ui-fg-muted"><Photo /></div>}
                <span className="truncate text-[13.5px]">{p.title}</span>
              </button>
            ))
          )}
        </div>
      </Panel>

      {/* Variants of the chosen product */}
      {sel && (
        <Panel
          title={`${sel.title} — хэмжээнүүд`}
          actions={<Badge size="2xsmall" color="grey">{variants.length}</Badge>}
        >
          {loadingVars ? (
            <div className="p-4"><Text size="small" className="text-ui-fg-subtle">Ачаалж байна…</Text></div>
          ) : variants.length === 0 ? (
            <EmptyState title="Хувилбар алга" hint="Энэ бараанд хэмжээний сонголт байхгүй байна." />
          ) : (
            <div className="divide-y divide-ui-border-base">
              {variants.map(v => (
                <div key={v.id} className="flex items-center gap-4 p-4">
                  {v.image
                    ? <img src={v.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover bg-ui-bg-subtle" />
                    : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-ui-bg-subtle text-ui-fg-muted"><Photo /></div>}

                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{v.title}</div>
                    {v.sku && <div className="mt-0.5 truncate font-mono text-[11px] text-ui-fg-muted">{v.sku}</div>}
                    <div className="mt-1">
                      {v.image
                        ? <Badge size="2xsmall" color="green">Зурагтай</Badge>
                        : <Badge size="2xsmall" color="grey">Үндсэн зураг</Badge>}
                    </div>
                  </div>

                  <input
                    ref={el => { fileRefs.current[v.id] = el; }}
                    type="file" accept="image/*" className="hidden"
                    onChange={e => onFile(v, e.target.files?.[0])}
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" size="small" isLoading={busy === v.id}
                      onClick={() => fileRefs.current[v.id]?.click()}>
                      {v.image ? "Солих" : "Зураг оруулах"}
                    </Button>
                    {v.image && (
                      <Button variant="danger" size="small" disabled={busy === v.id} onClick={() => saveImage(v, null)}>
                        Хасах
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Хувилбарын зураг",
  icon: Photo,
});

export default VariantImagesPage;
