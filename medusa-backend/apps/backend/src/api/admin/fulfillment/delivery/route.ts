import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getDelivery, setDeliveryFee } from "../../../../lib/delivery";
import { audit } from "../../../../lib/audit";
import { revalidateStorefront } from "../../../../lib/revalidate-storefront";

// GET  /admin/fulfillment/delivery — current delivery fee (0 = free).
// POST /admin/fulfillment/delivery { fee } — set it. Guarded by orders.* (middlewares).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await getDelivery(req.scope));
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const fee = Number((req.body as any)?.fee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000) {
    return res.status(400).json({ message: "Хүргэлтийн төлбөр 0-ээс 1,000,000₮ хооронд байна" });
  }
  const result = await setDeliveryFee(req.scope, fee);
  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "delivery.fee",
    target: result.option_id || "",
    meta: { fee: result.fee },
  }, Date.now());
  await revalidateStorefront(["catalog"]);
  res.json(result);
}
