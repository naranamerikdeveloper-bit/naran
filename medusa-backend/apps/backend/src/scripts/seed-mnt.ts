import { assertDestructiveAllowed } from "../lib/destructive-guard";
import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createRegionsWorkflow,
  updateProductVariantsWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows";

// 1 USD ≈ 3450 MNT (adjust to taste). Prices kept as integers (MNT has no cents).
const RATE = 3450;

const USD: Record<string, number> = {
  "tech-fleece-hoodie": 128, "performance-tank": 42, "training-joggers": 96,
  "compression-longsleeve": 64, "windbreaker-jacket": 148, "lined-training-shorts": 56,
  "seamless-leggings": 88, "womens-cropped-tee": 44, "tactical-sling-bag": 72,
  "performance-cap": 34, "thermal-hooded-base": 78, "cargo-tech-pants": 116,
};

export default async function seedMnt({ container }: ExecArgs) {
  assertDestructiveAllowed("seed-mnt");
  const logger = container.resolve("logger");
  const storeModule = container.resolve(Modules.STORE);
  const regionModule = container.resolve(Modules.REGION);
  const productModule = container.resolve(Modules.PRODUCT);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);

  // 1) Add MNT to store currencies (default)
  const [store] = await storeModule.listStores();
  await storeModule.updateStores(store.id, {
    supported_currencies: [
      { currency_code: "mnt", is_default: true },
      { currency_code: "usd" },
    ],
  });
  logger.info("Store currencies: mnt (default), usd");

  // 2) Mongolia (MNT) region
  let [mnRegion] = await regionModule.listRegions({ currency_code: "mnt" });
  if (!mnRegion) {
    const { result } = await createRegionsWorkflow(container).run({
      input: { regions: [{ name: "Mongolia", currency_code: "mnt", countries: ["mn"], payment_providers: ["pp_system_default"] }] },
    });
    mnRegion = result[0];
    logger.info(`Created Mongolia region: ${mnRegion.id}`);
  } else {
    logger.info(`Mongolia region exists: ${mnRegion.id}`);
  }

  // 3) Add MNT price to every variant (keep USD too)
  const products = await productModule.listProducts({}, { relations: ["variants"], take: 1000 });
  const updates: { id: string; prices: { currency_code: string; amount: number }[] }[] = [];
  for (const p of products) {
    const usd = USD[p.handle as string];
    if (!usd) continue;
    for (const v of p.variants) {
      updates.push({ id: v.id, prices: [
        { currency_code: "usd", amount: usd },
        { currency_code: "mnt", amount: usd * RATE },
      ] });
    }
  }
  if (updates.length) {
    await updateProductVariantsWorkflow(container).run({ input: { product_variants: updates } });
    logger.info(`Added MNT prices to ${updates.length} variants`);
  }

  // 4) Mongolia shipping (service zone + options in MNT)
  const [profile] = await fulfillmentModule.listShippingProfiles({});
  const sets = await fulfillmentModule.listFulfillmentSets({}, { relations: ["service_zones"] });
  const fset = sets[0];
  let [zone] = await fulfillmentModule.listServiceZones({ name: "Mongolia" });
  if (!zone) {
    const { result } = await createServiceZonesWorkflow(container).run({
      input: { data: [{ fulfillment_set_id: fset.id, name: "Mongolia", geo_zones: [{ type: "country", country_code: "mn" }] }] },
    });
    zone = result[0];
    logger.info("Created Mongolia service zone");
  }
  const existing = await fulfillmentModule.listShippingOptions({ name: "Standard (MN)" });
  if (!existing.length) {
    await createShippingOptionsWorkflow(container).run({
      input: [
        { name: "Standard (MN)", service_zone_id: zone.id, shipping_profile_id: profile.id, provider_id: "manual_manual",
          type: { label: "Standard", description: "3-5 business days", code: "standard" }, price_type: "flat",
          prices: [{ currency_code: "mnt", amount: 0 }],
          rules: [{ attribute: "enabled_in_store", value: "true", operator: "eq" }, { attribute: "is_return", value: "false", operator: "eq" }] },
        { name: "Express (MN)", service_zone_id: zone.id, shipping_profile_id: profile.id, provider_id: "manual_manual",
          type: { label: "Express", description: "1-2 business days", code: "express" }, price_type: "flat",
          prices: [{ currency_code: "mnt", amount: 18 * RATE }],
          rules: [{ attribute: "enabled_in_store", value: "true", operator: "eq" }, { attribute: "is_return", value: "false", operator: "eq" }] },
      ],
    });
    logger.info("Created Mongolia shipping options (MNT)");
  }

  logger.info("MNT seed complete.");
}
