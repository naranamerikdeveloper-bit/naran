import { Modules } from "@medusajs/framework/utils";

// Medusa's Store module REPLACES `metadata` on update — it does NOT deep-merge.
// So a writer that sends only its own key ({ [key]: value }) silently wipes every
// other key on the store. That is exactly how the CMS homepage content vanished:
// the audit log fires on every admin action and, writing only { naran_audit },
// clobbered cms_homepage / delivery_option_id.
//
// The fix: always re-read the freshest store row and spread its existing metadata
// so only the one key we own changes. Two writers racing can still drop one
// update, but no unrelated key is ever destroyed.
export async function setStoreMeta(
  scope: { resolve: (k: any) => any },
  key: string,
  value: any,
): Promise<void> {
  const storeModule = scope.resolve(Modules.STORE);
  const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
  if (!store) return;
  await storeModule.updateStores(store.id, {
    metadata: { ...((store.metadata as any) || {}), [key]: value },
  } as any);
}
