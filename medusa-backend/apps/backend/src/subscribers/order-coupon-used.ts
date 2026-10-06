import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { markCouponsUsed } from "../lib/coupons";

// When an order is placed with a discount code, stamp that code as spent in the
// buyer's coupon wallet — otherwise their profile keeps offering a coupon they
// have already redeemed.
//
// Best-effort: a failure here must never fail the order, so everything is
// wrapped and only logged.
export default async function orderCouponUsedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "promotions.code"],
      filters: { id: data.id } as any,
      pagination: { take: 1 },
    });
    const order = (orders || [])[0] as any;
    const customerId = order?.customer_id;
    const codes = (order?.promotions || []).map((p: any) => p?.code).filter(Boolean);
    if (!customerId || codes.length === 0) return;
    await markCouponsUsed(container, customerId, codes);
  } catch (e) {
    console.log(`[coupons] could not mark codes used for order ${data.id}: ${(e as Error).message}`);
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
