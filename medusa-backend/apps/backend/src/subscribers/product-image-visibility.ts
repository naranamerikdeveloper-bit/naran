import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { syncImageVisibility } from "../lib/image-visibility";

// Keep "no picture → hidden from shoppers" true on every product change:
// a product saved without images is parked as draft; adding an image in the
// admin re-publishes it automatically. See lib/image-visibility.ts.
export default async function productImageVisibility({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!data?.id) return;
  try {
    await syncImageVisibility(container, [data.id]);
  } catch (e: any) {
    console.warn(`[image-visibility] ${data.id}: ${e?.message || e}`);
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
};
