import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

// Single delivery fee, editable from the admin (Биелүүлэлт → Хүргэлтийн төлбөр).
// The storefront no longer offers a choice of shipping methods: every order uses
// one Medusa shipping option, and its price IS the delivery fee (0 = free). The
// price lives on the shipping option itself, so cart totals stay authoritative.
//
// Which option: store.metadata.delivery_option_id, else "Standard (MN)", else
// the cheapest non-return option.

const CURRENCY = "mnt";
const PREFERRED_NAME = "Standard (MN)";

type Opt = { id: string; name: string; amount: number };

async function listOptions(scope: any): Promise<Opt[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "rules.attribute", "rules.value", "prices.amount", "prices.currency_code"],
  });
  return (data as any[])
    .filter(o => !(o.rules || []).some((r: any) => r.attribute === "is_return" && String(r.value).includes("true")))
    .map(o => ({
      id: o.id,
      name: o.name,
      amount: Number((o.prices || []).find((p: any) => p.currency_code === CURRENCY)?.amount ?? 0),
    }));
}

async function getStore(scope: any) {
  const storeModule = scope.resolve(Modules.STORE);
  const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
  return { storeModule, store };
}

export async function getDelivery(scope: any): Promise<{ option_id: string | null; fee: number; name: string | null }> {
  const [{ store }, opts] = await Promise.all([getStore(scope), listOptions(scope)]);
  const savedId = (store?.metadata as any)?.delivery_option_id;
  const opt = opts.find(o => o.id === savedId)
    || opts.find(o => o.name === PREFERRED_NAME)
    || [...opts].sort((a, b) => a.amount - b.amount)[0];
  return opt ? { option_id: opt.id, fee: opt.amount, name: opt.name } : { option_id: null, fee: 0, name: null };
}

export async function setDeliveryFee(scope: any, fee: number) {
  const amount = Math.max(0, Math.round(fee));
  const current = await getDelivery(scope);
  if (!current.option_id) throw new Error("Хүргэлтийн сонголт олдсонгүй");

  await updateShippingOptionsWorkflow(scope).run({
    input: [{ id: current.option_id, prices: [{ currency_code: CURRENCY, amount }] } as any],
  });

  // Pin the option so the choice never drifts when prices change.
  const { storeModule, store } = await getStore(scope);
  if (store) {
    await storeModule.updateStores(store.id, {
      metadata: { delivery_option_id: current.option_id }, // merged by Medusa
    });
  }
  return getDelivery(scope);
}
