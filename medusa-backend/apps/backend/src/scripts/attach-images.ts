import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import * as fs from "fs";
import * as path from "path";

/**
 * Attach product images from a folder, matched by file name.
 *
 *   IMAGE_DIR=./data/zurag  npx medusa exec ./src/scripts/attach-images.ts
 *   IMAGE_DIR=./data/zurag FORCE=1 …   # also replace images on products that already have some
 *
 * File name = product handle, optionally with an order suffix:
 *   chanel-chance-eau-tendre-edp.webp          → the product's only / main image
 *   chanel-chance-eau-tendre-edp__1.webp, __2  → gallery order; __1 becomes the thumbnail
 * (a "-2" suffix also works: dior-j-adore-edp-2.jpg). Files are uploaded through the
 * configured File provider (R2 in production). Products that already have a
 * thumbnail are skipped unless FORCE=1, so the script is safe to re-run.
 */

const MIME: Record<string, string> = {
  ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

export default async function attachImages({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const fileModule = container.resolve(Modules.FILE);
  const productModule = container.resolve(Modules.PRODUCT);

  const dir = process.env.IMAGE_DIR;
  if (!dir || !fs.existsSync(dir)) throw new Error(`Set IMAGE_DIR to an existing folder (got: ${dir})`);
  const force = process.env.FORCE === "1";

  // handle → [{ order, file }]
  const byHandle = new Map<string, { order: number; file: string }[]>();
  for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase();
    if (!MIME[ext]) continue;
    const base = path.basename(f, ext);
    const m = base.match(/^(.*?)(?:__(\d+)|-(\d+))?$/)!;
    let handle = m[1], order = Number(m[2] ?? m[3] ?? 1);
    // "-2" could be part of a real handle (e.g. "toy-2-edp"): only treat it as an
    // order suffix when the full base name is not itself a product handle.
    if (m[3] && !m[2]) { handle = base; order = 1; }
    (byHandle.get(handle) || byHandle.set(handle, []).get(handle)!).push({ order, file: f });
  }

  const products = await productModule.listProducts({ handle: [...byHandle.keys()] }, { select: ["id", "handle", "thumbnail"] as any });
  const byH = new Map(products.map(p => [p.handle!, p]));
  // Retry "-N" names as order suffixes when the whole name matched no product.
  for (const [h, list] of [...byHandle]) {
    const s = h.match(/^(.*)-(\d+)$/);
    if (!byH.has(h) && s) {
      byHandle.delete(h);
      const target = byHandle.get(s[1]) || byHandle.set(s[1], []).get(s[1])!;
      list.forEach(x => target.push({ order: Number(s[2]), file: x.file }));
    }
  }
  const missing = [...byHandle.keys()].filter(h => !byH.has(h));
  if (missing.length) {
    const more = await productModule.listProducts({ handle: missing }, { select: ["id", "handle", "thumbnail"] as any });
    more.forEach(p => byH.set(p.handle!, p));
  }

  let done = 0, skipped = 0, files = 0;
  const unknown: string[] = [];
  for (const [handle, list] of byHandle) {
    const p = byH.get(handle);
    if (!p) { unknown.push(handle); continue; }
    if (p.thumbnail && !force) { skipped++; continue; }
    list.sort((a, b) => a.order - b.order);
    const urls: string[] = [];
    for (const { file } of list) {
      const ext = path.extname(file).toLowerCase();
      const content = fs.readFileSync(path.join(dir, file)).toString("base64");
      const [res] = await fileModule.createFiles([{ filename: `products/${handle}/${file}`, mimeType: MIME[ext], content }]);
      urls.push(res.url);
      files++;
    }
    // Workflow (not the bare module) so product.updated fires → search index refreshes.
    await updateProductsWorkflow(container).run({
      input: { selector: { id: p.id }, update: { thumbnail: urls[0], images: urls.map(url => ({ url })) } },
    });
    done++;
  }

  if (unknown.length) logger.warn(`No product for: ${unknown.join(", ")}`);
  logger.info(`Done. ${done} products updated with ${files} images; ${skipped} skipped (already had images).`);
}
