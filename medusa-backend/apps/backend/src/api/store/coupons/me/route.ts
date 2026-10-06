import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { walletWithState } from "../../../../lib/coupons";

// GET /store/coupons/me — the signed-in shopper's coupon wallet.
//
// Read-only on purpose: codes are granted by the shop (admin), never by the
// holder. Writing to customer metadata from the storefront is blocked in
// api/middlewares so nobody can mint themselves a discount.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id;
  if (!customerId) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  res.json({ coupons: await walletWithState(req.scope, customerId) });
}
