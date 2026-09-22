import { assertDestructiveAllowed } from "../lib/destructive-guard";
import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function seedRegion({ container }: ExecArgs) {
  assertDestructiveAllowed("seed-region");
  const logger = container.resolve("logger");
  const storeModule = container.resolve(Modules.STORE);
  const regionModule = container.resolve(Modules.REGION);

  const [store] = await storeModule.listStores();
  await storeModule.updateStores(store.id, {
    supported_currencies: [
      { currency_code: "usd", is_default: true },
      { currency_code: "eur" },
    ],
  });
  logger.info("Store currencies set: usd (default), eur");

  const existing = await regionModule.listRegions({ currency_code: "usd" });
  if (existing.length) { logger.info("USD region already exists"); return; }

  await createRegionsWorkflow(container).run({
    input: {
      regions: [{
        name: "United States",
        currency_code: "usd",
        countries: ["us"],
        payment_providers: ["pp_system_default"],
      }],
    },
  });
  logger.info("Created United States (USD) region");
}
