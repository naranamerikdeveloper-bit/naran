import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Photo } from "@medusajs/icons";
import { Container, Text, Button, Input, Badge, toast } from "@medusajs/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "../../lib/perms";
import { AccessDenied } from "../../lib/AccessDenied";
import { PageHeader, Panel } from "../../lib/ui";

// "Зураг оруулах" — give image-less products their pictures from the admin.
// Products without an image are hidden from shoppers (lib/image-visibility);
// attaching one here publishes them automatically.
//  • per product: pick file(s) on its row
//  • in bulk: drop many files named by product handle (as in the image list),
//    e.g. chanel-chance-eau-tendre-edt.webp, …__2.webp for extra gallery shots
// Images are resized/converted to WebP in the browser before upload.

type Item = { id: string; title: string; handle: string; brand: string; type: string };

const MAX_W = 1200, MAX_H = 1500, QUALITY = 0.86;

/** Downscale + convert to WebP in the browser; falls back to the original file. */
async function optimize(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_W / bmp.width, MAX_H / bmp.height);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, "image/webp", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

async function uploadFiles(files: File[]): Promise<string[]> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: fd });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const data = await res.json();
  return (data.files || []).map((f: any) => f.url);
}

async function attach(productId: string, urls: string[]) {
  const res = await fetch(`/admin/products/${productId}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ thumbnail: urls[0], images: urls.map(url => ({ url })) }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any)?.message || `Save failed (${res.status})`);
  }
}

/** "handle__2.webp" / "handle-2.jpg" / "handle.png" → { handle, order } for known handles. */
function matchFile(name: string, handles: Set<string>): { handle: string; order: number } | null {
  const base = name.replace(/\.[^.]+$/, "").trim().toLowerCase();
  const dbl = base.match(/^(.*)__(\d+)$/);
  if (dbl && handles.has(dbl[1])) return { handle: dbl[1], order: +dbl[2] };
  if (handles.has(base)) return { handle: base, order: 1 };
  const dash = base.match(/^(.*)-(\d+)$/);
  if (dash && handles.has(dash[1])) return { handle: dash[1], order: +dash[2] };
  return null;
}

const ImagesPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // product id or "bulk"
  const [bulk, setBulk] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const bulkInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/admin/catalog/hidden-no-image", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems(d.items || []);
      setLoadError(false);
    } catch {
      // Don't show "every product has a picture" when we simply couldn't load.
      setLoadError(true);
      setItems([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handles = useMemo(() => new Set((items || []).map(i => i.handle)), [items]);
  const byHandle = useMemo(() => new Map((items || []).map(i => [i.handle, i])), [items]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items || []).filter(i => !n || `${i.title} ${i.brand} ${i.handle}`.toLowerCase().includes(n));
  }, [items, q]);

  // Bulk: group dropped files by the product they name.
  const plan = useMemo(() => {
    const groups = new Map<string, { item: Item; files: { f: File; order: number }[] }>();
    const unmatched: File[] = [];
    for (const f of bulk) {
      const m = matchFile(f.name, handles);
      if (!m) { unmatched.push(f); continue; }
      const g = groups.get(m.handle) || { item: byHandle.get(m.handle)!, files: [] };
      g.files.push({ f, order: m.order });
      groups.set(m.handle, g);
    }
    groups.forEach(g => g.files.sort((a, b) => a.order - b.order));
    return { groups: [...groups.values()], unmatched };
  }, [bulk, handles, byHandle]);

  if (!permLoading && !can("catalog.write")) {
    return <AccessDenied title="Зураг оруулах" perm="catalog.write" />;
  }

  const addOne = async (item: Item, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(item.id);
    try {
      const optimized = await Promise.all([...files].map(optimize));
      const urls = await uploadFiles(optimized);
      await attach(item.id, urls);
      toast.success(`${item.title} — нийтлэгдлээ`);
      setItems(list => (list || []).filter(i => i.id !== item.id));
    } catch (e: any) {
      toast.error(e?.message || "Алдаа гарлаа");
    } finally {
      setBusy(null);
    }
  };

  const runBulk = async () => {
    const groups = plan.groups;
    if (!groups.length) return;
    setBusy("bulk");
    setProgress({ done: 0, total: groups.length });
    let ok = 0;
    const failed: string[] = [];
    for (const g of groups) {
      try {
        const optimized = await Promise.all(g.files.map(x => optimize(x.f)));
        const urls = await uploadFiles(optimized);
        await attach(g.item.id, urls);
        ok++;
      } catch {
        failed.push(g.item.title);
      }
      setProgress(p => (p ? { ...p, done: p.done + 1 } : p));
    }
    setBusy(null);
    setProgress(null);
    setBulk([]);
    if (ok) toast.success(`${ok} бараа зурагтай болж нийтлэгдлээ`);
    if (failed.length) toast.error(`Амжилтгүй: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`);
    load();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    if (files.length) setBulk(files);
  };

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Зураг оруулах"
        description="Зураггүй бараа дэлгүүрт харагддаггүй. Зураг нэмэхэд тухайн бараа автоматаар нийтлэгдэнэ."
        actions={items && <Badge color={items.length ? "orange" : "green"}>{items.length} бараа зураг хүлээж байна</Badge>}
      />

      {/* Bulk */}
      <Panel title="Олноор нь оруулах">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => bulkInput.current?.click()}
          className={`cursor-pointer px-6 py-8 text-center transition-colors ${drag ? "bg-ui-bg-highlight" : "bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover"}`}
        >
          <Photo className="mx-auto text-ui-fg-muted" />
          <Text weight="plus" className="mt-2">Зургуудаа энд чирж оруулна уу, эсвэл дарж сонгоно уу</Text>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Файлын нэр = барааны handle. Жишээ: <code>chanel-chance-eau-tendre-edt.webp</code>, нэмэлт зураг: <code>…__2.webp</code>
          </Text>
          <input ref={bulkInput} type="file" accept="image/*" multiple hidden
            onChange={e => { setBulk([...(e.target.files || [])]); e.target.value = ""; }} />
        </div>
        {bulk.length > 0 && (
          <div className="border-t border-ui-border-base px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="green">{plan.groups.length} бараа тохирлоо ({plan.groups.reduce((a, g) => a + g.files.length, 0)} зураг)</Badge>
              {plan.unmatched.length > 0 && <Badge color="red">{plan.unmatched.length} файл тохирсонгүй</Badge>}
              <div className="flex-1" />
              <Button variant="secondary" size="small" onClick={() => setBulk([])} disabled={busy === "bulk"}>Цуцлах</Button>
              <Button size="small" onClick={runBulk} isLoading={busy === "bulk"} disabled={!plan.groups.length || busy === "bulk"}>
                {progress ? `${progress.done}/${progress.total} …` : `${plan.groups.length} барааг оруулах`}
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto text-[12px] space-y-0.5">
              {plan.groups.map(g => (
                <div key={g.item.id} className="flex gap-2"><span className="text-ui-fg-interactive">✓</span>
                  <span className="truncate">{g.item.title}</span><span className="text-ui-fg-muted">× {g.files.length}</span></div>
              ))}
              {plan.unmatched.map(f => (
                <div key={f.name} className="flex gap-2 text-ui-fg-error"><span>✕</span><span className="truncate">{f.name}</span>
                  <span className="text-ui-fg-muted">— ийм handle-тэй зураггүй бараа алга</span></div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Per product */}
      <Panel title="Зураггүй бараа" actions={
        <Input size="small" placeholder="Нэр, брэнд хайх…" value={q} onChange={e => setQ(e.target.value)} className="w-56" />
      }>
        {items === null ? (
          <Text className="px-4 py-6 text-ui-fg-subtle">Ачаалж байна…</Text>
        ) : filtered.length === 0 ? (
          <Text className="px-4 py-6 text-ui-fg-subtle">{loadError ? "Жагсаалтыг ачаалж чадсангүй (эрх эсвэл сүлжээ). Хуудсыг дахин ачаална уу." : items.length ? "Олдсонгүй." : "Бүх бараа зурагтай 🎉"}</Text>
        ) : (
          <div className="divide-y divide-ui-border-base max-h-[60vh] overflow-y-auto">
            {filtered.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-10 w-8 shrink-0 rounded bg-ui-bg-component grid place-items-center"><Photo className="text-ui-fg-muted" /></div>
                <div className="min-w-0 flex-1">
                  <a href={`/app/products/${item.id}`} className="block truncate text-[13px] font-medium hover:underline">{item.title}</a>
                  <Text size="xsmall" className="text-ui-fg-muted truncate">{item.brand} · {item.handle}</Text>
                </div>
                <label className={`shrink-0 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                  <input type="file" accept="image/*" multiple hidden onChange={e => { addOne(item, e.target.files); e.target.value = ""; }} />
                  <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-ui-border-base bg-ui-button-neutral px-3 text-[12px] font-medium shadow-buttons-neutral hover:bg-ui-button-neutral-hover">
                    {busy === item.id ? "Оруулж байна…" : "Зураг сонгох"}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Зураг оруулах",
  icon: Photo,
});

export default ImagesPage;
