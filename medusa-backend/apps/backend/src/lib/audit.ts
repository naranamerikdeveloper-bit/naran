import { Modules } from "@medusajs/framework/utils";
import { setStoreMeta } from "./store-meta";

// Audit log of important admin actions (spec A-28 / AN-02). Entries are stored on
// Store.metadata.naran_audit (capped, newest-first) AND written to the container
// logger as a durable, append-only backstop (AN-07: ≥90-day retention lives in
// the log/Sentry pipeline; the in-app list is a convenient recent view).
//
// Trade-off: the metadata list is read-modify-write, so two simultaneous writes
// could drop one in-app entry — the logger copy is never lost. Admin mutations
// are low-frequency, so this is acceptable for the in-app view.

const KEY = "naran_audit";
const CAP = 500;

export type AuditEntry = {
  at: number;
  actor_id: string | null;
  action: string; // e.g. "role.assign", "catalog.bulk_edit", "fulfillment.ship"
  target?: string; // affected id / label
  meta?: Record<string, any>;
};

export async function audit(
  scope: { resolve: (k: any) => any },
  entry: Omit<AuditEntry, "at">,
  now: number,
) {
  const full: AuditEntry = { at: now, ...entry };
  // Durable backstop — structured, append-only.
  try {
    scope.resolve("logger").info(`[audit] ${full.action} actor=${full.actor_id || "?"} target=${full.target || "-"} ${JSON.stringify(full.meta || {})}`);
  } catch { /* logger optional */ }
  // In-app recent list on store metadata.
  try {
    const storeModule = scope.resolve(Modules.STORE);
    const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
    if (!store) return;
    const list: AuditEntry[] = Array.isArray((store.metadata as any)?.[KEY]) ? (store.metadata as any)[KEY] : [];
    const next = [full, ...list].slice(0, CAP);
    // Spread existing metadata — Medusa REPLACES it (see lib/store-meta). Writing
    // only { naran_audit } here is what previously wiped cms_homepage.
    await setStoreMeta(scope, KEY, next);
  } catch { /* never block the primary action on audit failure */ }
}

export async function readAudit(scope: { resolve: (k: any) => any }): Promise<AuditEntry[]> {
  const storeModule = scope.resolve(Modules.STORE);
  const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
  const list = (store?.metadata as any)?.[KEY];
  return Array.isArray(list) ? list : [];
}
