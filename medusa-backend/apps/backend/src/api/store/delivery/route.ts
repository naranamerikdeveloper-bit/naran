import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getDelivery } from "../../../lib/delivery";

// GET /store/delivery → { option_id, fee } — the single shipping option the
// storefront uses for every order, and its price (0 = free delivery).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { option_id, fee } = await getDelivery(req.scope);
  res.json({ option_id, fee });
}
