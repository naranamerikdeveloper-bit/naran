import { Modules } from "@medusajs/framework/utils";
import type { StockMove } from "./catalog";
import { setStoreMeta } from "./store-meta";

// Inventory movement history (spec A-15). Each stock adjustment is recorded with
// from → to, delta, reason and actor. Stored on Store.metadata.naran_stock_moves
// (capped, newest-first) + logged to the container logger as a durable backstop
// — same approach as the audit log (see lib/audit).

const KEY = "naran_stock_moves";
const CAP = 1000;

export type StockHistoryEntry = StockMove & {
  at: number;
  delta: number;
  reason: string;
  actor_id: string | null;
};

export async function recordMoves(
  scope: { resolve: (k: any) => any },
  moves: StockMove[],
  meta: { reason: string; actor_id: string | null },
  now: number,
) {
  if (!moves.length) return;
  const entries: StockHistoryEntry[] = moves.map((m) => ({
    ...m,
    at: now,
    delta: m.to - m.from,
    reason: meta.reason || "",
    actor_id: meta.actor_id,
  }));
  try {
    const logger = scope.resolve("logger");
    for (const e of entries) logger.info(`[stock] ${e.sku} ${e.from}→${e.to} (${e.delta >= 0 ? "+" : ""}${e.delta}) reason="${e.reason}" actor=${e.actor_id || "?"}`);
  } catch { /* logger optional */ }
  try {
    const storeModule = scope.resolve(Modules.STORE);
    const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
    if (!store) return;
    const list: StockHistoryEntry[] = Array.isArray((store.metadata as any)?.[KEY]) ? (store.metadata as any)[KEY] : [];
    const next = [...entries, ...list].slice(0, CAP);
    // Spread existing metadata — Medusa REPLACES it (see lib/store-meta).
    await setStoreMeta(scope, KEY, next);
  } catch { /* never block the stock update on history failure */ }
}

export async function readMoves(scope: { resolve: (k: any) => any }): Promise<StockHistoryEntry[]> {
  const storeModule = scope.resolve(Modules.STORE);
  const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
  const list = (store?.metadata as any)?.[KEY];
  return Array.isArray(list) ? list : [];
}
