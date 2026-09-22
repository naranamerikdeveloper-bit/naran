import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { sendShippedEmail } from "../lib/email";

// Fires when a shipment is created for an order (merchant marks it shipped in
// the admin). Sends the customer a NARAN "shipped" email. The event carries the
// fulfillment id; we resolve the owning order + customer from it.
export default async function orderShippedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (data.no_notification) return;

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  // Resolve the owning order from the fulfillment side (Order.fulfillments is not
  // a filterable query path, but the fulfillment → order link is).
  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "order.id", "order.display_id", "order.email", "order.metadata"],
    filters: { id: data.id },
  });

  const linked = (fulfillments?.[0] as any)?.order;
  // In-store (offline) sales are handed over on the spot — no "shipped" email
  // (their address is a placeholder, and bounces hurt sender reputation).
  if ((linked as any)?.metadata?.offline) return;
  if (!linked?.email) {
    console.log(`[shipped] could not resolve order for fulfillment ${data.id}`);
    return;
  }

  // Line items (product_title + quantity) come reliably from the order module.
  const orderModule = container.resolve(Modules.ORDER);
  const order = await orderModule.retrieveOrder(linked.id, { relations: ["items"] });

  await sendShippedEmail({
    id: linked.display_id ? `NT-${linked.display_id}` : linked.id,
    email: linked.email,
    items: (order.items || []).map((i: any) => ({
      title: i.product_title || i.title || "Бараа",
      quantity: i.quantity,
    })),
  });
}

export const config: SubscriberConfig = {
  event: "shipment.created",
};
