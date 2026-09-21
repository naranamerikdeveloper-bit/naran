import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { revalidateStorefrontSoon } from "../lib/revalidate-storefront";

// Product / category changes in the admin → purge the storefront's cached
// catalog so prices, images and new products show up right away.
export default async function storefrontRevalidate(_: SubscriberArgs<unknown>) {
  revalidateStorefrontSoon("catalog");
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-variant.updated",
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
  ],
};
