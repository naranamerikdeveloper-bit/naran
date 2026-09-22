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

function conn(): Promise<RedisClientType | null> {
  if (!URL) return Promise.resolve(null);
  if (!ready) {
    client = createClient({ url: URL, socket: { reconnectStrategy: (n) => Math.min(n * 200, 5000) } });
    client.on("error", (e) => { if (!warned) { warned = true; console.error("[store] redis error:", e.message); } });
    client.on("ready", () => { warned = false; });
    ready = client.connect().then(() => client).catch((e) => {
      console.error("[store] redis connect failed:", e.message);
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
    await c.set(PREFIX + id, JSON.stringify(rec), { EX: TTL_S });
    if (pending) await c.sAdd(PENDING, id);
    else await c.sRem(PENDING, id);
  } catch (e: any) {
    console.error("[store] put failed:", e.message);
  }
}

export async function getRecord<T>(id: string): Promise<T | null> {
  try {
    const c = await conn();
    if (!c) return null;
    const raw = await c.get(PREFIX + id);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e: any) {
    console.error("[store] get failed:", e.message);
    return null;
  }
}

export async function pendingIds(): Promise<string[]> {
  try {
    const c = await conn();
    return c ? await c.sMembers(PENDING) : [];
  } catch {
    return [];
  }
}

export async function dropPending(id: string): Promise<void> {
  try { const c = await conn(); if (c) await c.sRem(PENDING, id); } catch { /* ignore */ }
}
