import { ExecArgs } from "@medusajs/framework/types";
import { syncImageVisibility } from "../lib/image-visibility";

/**
 * Apply the "no image → hidden (draft)" rule to the whole catalog once, e.g.
 * after a bulk import. New/edited products are handled by the
 * product-image-visibility subscriber automatically.
 *
 *   npx medusa exec ./src/scripts/sync-image-visibility.ts
 */
export default async function run({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const r = await syncImageVisibility(container);
  logger.info(`Checked ${r.seen} products: ${r.hidden} hidden (no image), ${r.published} re-published (image added).`);
}
