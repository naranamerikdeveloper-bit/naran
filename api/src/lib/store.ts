import { createClient, type RedisClientType } from "redis";

// Durable key/value for payment state (Botxon invoices). Payment records used to
// live only in process memory, so an api restart lost them: a customer who paid
// and closed the tab could end up with money captured and no order. Redis keeps
// them across restarts; a pending set lets a background job reconcile invoices
// nobody is polling.
//
// Best-effort: without REDIS_URL (local dev) or if Redis is down, callers fall
// back to their in-memory cache — never block a payment on the store.

const URL = process.env.REDIS_URL;
const PREFIX = "naran:pay:";
const PENDING = `${PREFIX}pending`;
const TTL_S = 60 * 60 * 24 * 14; // keep records two weeks (reconciliation / support)

let client: RedisClientType | null = null;
let ready: Promise<RedisClientType | null> | null = null;
let warned = false;

// Bound every store call — a slow/unreachable Redis must never stall a payment.
function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("redis timeout")), ms))]);
}

function conn(): Promise<RedisClientType | null> {
  if (!URL) return Promise.resolve(null);
  if (!ready) {
    // No offline queue + short timeouts: when Redis is down, calls fail fast and
    // payments fall back to memory instead of hanging.
    client = createClient({
      url: URL,
      disableOfflineQueue: true,
      socket: { connectTimeout: 3000, reconnectStrategy: (n) => Math.min(n * 200, 5000) },
    });
    client.on("error", (e) => { if (!warned) { warned = true; console.error("[store] redis error:", e.message); } });
    client.on("ready", () => { warned = false; });
    ready = withTimeout(client.connect().then(() => client), 4000).catch((e) => {
      console.error("[store] redis connect failed:", e.message);
      client?.disconnect().catch(() => {}); // don't leak a reconnecting client
      ready = null;
      return null;
    });
  }
  return ready;
}

export async function putRecord(id: string, rec: unknown, pending: boolean): Promise<void> {
  try {
    const c = await conn();
    if (!c) return;
    await withTimeout(c.set(PREFIX + id, JSON.stringify(rec), { EX: TTL_S }));
    await withTimeout(pending ? c.sAdd(PENDING, id) : c.sRem(PENDING, id));
  } catch (e: any) {
    console.error("[store] put failed:", e.message);
  }
}

export async function getRecord<T>(id: string): Promise<T | null> {
  try {
    const c = await conn();
    if (!c) return null;
    const raw = await withTimeout(c.get(PREFIX + id));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e: any) {
    console.error("[store] get failed:", e.message);
    return null;
  }
}

/**
 * Atomically claim a one-shot key (Redis SET NX). Returns true only for the
 * very first caller, false if someone already claimed it, and null when the
 * store is unavailable — callers MUST treat null as "cannot guarantee" and fail
 * closed for anything that books money.
 */
export async function claimOnce(id: string, ttlS = TTL_S): Promise<boolean | null> {
  try {
    const c = await conn();
    if (!c) return null;
    const ok = await withTimeout(c.set(`${PREFIX}claim:${id}`, "1", { NX: true, EX: ttlS }));
    return ok === "OK";
  } catch (e: any) {
    console.error("[store] claim failed:", e.message);
    return null;
  }
}

/** Undo a claim, so a sale that failed to record can be retried. */
export async function releaseClaim(id: string): Promise<void> {
  try { const c = await conn(); if (c) await withTimeout(c.del(`${PREFIX}claim:${id}`)); } catch { /* ignore */ }
}

export async function pendingIds(): Promise<string[]> {
  try {
    const c = await conn();
    return c ? await withTimeout(c.sMembers(PENDING)) : [];
  } catch {
    return [];
  }
}

export async function dropPending(id: string): Promise<void> {
  try { const c = await conn(); if (c) await withTimeout(c.sRem(PENDING, id)); } catch { /* ignore */ }
}
