import { Modules } from "@medusajs/framework/utils";

// Medusa REPLACES metadata on update — it does not merge (the same trap that
// once wiped the CMS; see lib/store-meta). Every write to a customer's metadata
// goes through here so one feature can never erase another's keys
// (naran_coupons, deletion_requested_at, …).

export async function readCustomerMeta(
  scope: { resolve: (k: any) => any },
  customerId: string,
): Promise<Record<string, any>> {
  const customerModule = scope.resolve(Modules.CUSTOMER);
  const [customer] = await customerModule.listCustomers(
    { id: customerId } as any,
    { take: 1, select: ["id", "metadata"] as any },
  );
  return ((customer?.metadata as any) || {}) as Record<string, any>;
}

export async function setCustomerMeta(
  scope: { resolve: (k: any) => any },
  customerId: string,
  patch: Record<string, any>,
): Promise<void> {
  const customerModule = scope.resolve(Modules.CUSTOMER);
  const current = await readCustomerMeta(scope, customerId);
  await customerModule.updateCustomers(customerId, {
    metadata: { ...current, ...patch },
  } as any);
}
