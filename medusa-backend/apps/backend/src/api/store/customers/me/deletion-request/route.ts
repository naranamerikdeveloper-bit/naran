import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { setCustomerMeta } from "../../../../../lib/customer-meta";

// POST /store/customers/me/deletion-request
// GDPR-style "right to erasure": the signed-in customer requests deletion of
// their personal data. We flag the account (metadata.deletion_requested_at) for
// an admin to process, rather than hard-deleting — order records must be retained
// for accounting / e-Barimt. Requires a customer auth token.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id;
  if (!customerId) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  const requestedAt = new Date().toISOString();
  // Merge, never replace: the customer's coupon wallet lives on the same
  // metadata object and must survive a deletion request.
  await setCustomerMeta(req.scope, customerId, { deletion_requested_at: requestedAt });
  // eslint-disable-next-line no-console
  console.log(`[privacy] deletion requested for customer ${customerId} at ${requestedAt}`);
  res.json({ ok: true, requested_at: requestedAt });
}
