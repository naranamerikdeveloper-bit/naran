import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { grantCoupon, revokeCoupon, promotionSnapshot, walletWithState } from "../../../../lib/coupons";
import { audit } from "../../../../lib/audit";

// Coupon wallet administration — which customer holds which discount code.
//
// GET  /admin/marketing/coupons?email=…  → that customer's wallet
// POST /admin/marketing/coupons          → { email, code, note, action }
//
// Guarded by promotions.write (see middlewares): handing out money is a
// marketing action, not a customer-support one — which is also why it lives
// under /admin/marketing rather than /admin/crm (a marketer has no customer
// permissions).

async function findCustomer(scope: any, email: string, customerId: string) {
  const customerModule = scope.resolve(Modules.CUSTOMER);
  if (customerId) {
    const [c] = await customerModule.listCustomers({ id: customerId } as any, { take: 1 });
    return c || null;
  }
  const [c] = await customerModule.listCustomers({ email } as any, { take: 1 });
  return c || null;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const email = String(req.query.email ?? "").trim().toLowerCase();
  const customerId = String(req.query.customer_id ?? "").trim();
  if (!email && !customerId) {
    res.status(400).json({ message: "email эсвэл customer_id шаардлагатай" });
    return;
  }
  const customer = await findCustomer(req.scope, email, customerId);
  if (!customer) {
    res.status(404).json({ message: "Хэрэглэгч олдсонгүй" });
    return;
  }
  res.json({
    customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name },
    coupons: await walletWithState(req.scope, customer.id),
  });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const customerId = String(body.customer_id ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  const note = String(body.note ?? "").trim();
  const action = body.action === "revoke" ? "revoke" : "grant";

  if (!code) {
    res.status(400).json({ message: "Код хоосон байна" });
    return;
  }
  const customer = await findCustomer(req.scope, email, customerId);
  if (!customer) {
    res.status(404).json({ message: "Хэрэглэгч олдсонгүй — энэ и-мэйлээр бүртгэлтэй хэрэглэгч алга" });
    return;
  }

  if (action === "revoke") {
    await revokeCoupon(req.scope, customer.id, code);
  } else {
    // Refuse to hand out a code that does not exist: it would only fail at
    // checkout, in front of the shopper.
    const snap = await promotionSnapshot(req.scope, code);
    if (!snap.found) {
      res.status(404).json({ message: `"${code}" гэсэн хямдралын код олдсонгүй` });
      return;
    }
    await grantCoupon(req.scope, customer.id, code, note);
  }

  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: action === "revoke" ? "coupon.revoke" : "coupon.grant",
    target: customer.id,
    meta: { code, email: customer.email },
  }, Date.now());

  res.json({
    customer: { id: customer.id, email: customer.email },
    coupons: await walletWithState(req.scope, customer.id),
  });
}
