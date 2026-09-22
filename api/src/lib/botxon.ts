import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Botxon payment gateway client (https://botxon.chat) — QPay + Mongolian bank
 * apps via an invoice/QR model. Money lands in the merchant's own QPay account.
 *
 * Flow (unlike a hosted-redirect PSP): create an invoice → render its QR +
 * bank deeplinks on our own page → the buyer pays in their bank app → Botxon
 * calls our signed webhook AND we poll the status endpoint as the fallback and
 * final source of truth.
 *
 * No BOTXON_GATEWAY_KEY → MOCK mode (auto-"paid" after a short delay) so local
 * dev/checkout works without live credentials. The api refuses to boot in
 * production without the key (see index.ts), so mock never runs for real money.
 */

const URL_BASE = (process.env.BOTXON_GATEWAY_URL || "https://botxon.chat").replace(/\/+$/, "");
const KEY = process.env.BOTXON_GATEWAY_KEY;
export const BOTXON_LIVE = !!KEY;
const MOCK_DELAY_MS = 5000;

type Json = Record<string, any>;

export type BotxonBankUrl = { name?: string; description?: string; logo?: string; link: string };
export type BotxonInvoice = {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  shortUrl: string;
  urls: BotxonBankUrl[];
};
export type BotxonStatus = { status: "pending" | "paid" | "failed"; amount: number; orderRef: string; paidAt?: string | null };

async function gwFetch<T>(path: string, init: any = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
  let body: string | undefined;
  if (init.json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  const res = await fetch(`${URL_BASE}${path}`, { ...init, body, headers, cache: "no-store", signal: AbortSignal.timeout(10_000) } as any);
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || data?.message || `Botxon failed (${res.status})`);
  return data as T;
}

/* ---------- MOCK helpers (dev only) ---------- */
const mockInv = new Map<string, { amount: number; orderRef: string; created: number }>();
function mockStatus(id: string): "pending" | "paid" {
  const rec = mockInv.get(id);
  if (!rec) return "pending";
  return Date.now() - rec.created > MOCK_DELAY_MS ? "paid" : "pending";
}

/* ---------- API ---------- */
// 1) Create an invoice for an order. `orderRef` is our Medusa cart id — the
//    durable link we use to complete the order when payment lands.
export async function createInvoice(opts: {
  amount: number; description: string; orderRef: string; customerRef?: string;
}): Promise<BotxonInvoice> {
  if (!BOTXON_LIVE) {
    const invoiceId = `inv_mock_${Date.now()}_${randomUUID().slice(0, 8)}`;
    mockInv.set(invoiceId, { amount: opts.amount, orderRef: opts.orderRef, created: Date.now() });
    return { invoiceId, qrText: "0002010102...mockQPay", qrImage: "", shortUrl: "", urls: [] };
  }
  const raw = await gwFetch<Json>("/api/gateway/v1/invoices", {
    method: "POST",
    json: { amount: opts.amount, description: opts.description, orderRef: opts.orderRef, customerRef: opts.customerRef },
  });
  // The gateway's field names aren't pinned down (camelCase vs snake_case, id vs
  // invoiceId, optionally wrapped in { data }). A missing id made every status
  // check hit /invoices/undefined → 404, so normalize and refuse to continue
  // without one.
  const d: Json = raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
  const invoiceId = String(d.invoiceId ?? d.invoice_id ?? d.id ?? d.invoice?.id ?? "");
  if (!invoiceId) {
    console.error("[botxon] create response without an invoice id; keys:", Object.keys(d || {}).join(","));
    throw new Error("Botxon returned no invoice id");
  }
  console.log(`[botxon] invoice ${invoiceId} created (fields: ${Object.keys(d).join(",")})`);
  return {
    invoiceId,
    qrText: d.qrText ?? d.qr_text ?? "",
    qrImage: d.qrImage ?? d.qr_image ?? "",
    shortUrl: d.shortUrl ?? d.short_url ?? "",
    urls: d.urls ?? d.deeplinks ?? [],
  };
}

// 2) Authoritative status check. This is the source of truth: even after a
//    webhook we re-check here before completing the order.
export async function getInvoice(invoiceId: string): Promise<BotxonStatus> {
  if (!BOTXON_LIVE) {
    const rec = mockInv.get(invoiceId);
    return { status: mockStatus(invoiceId), amount: rec?.amount ?? 0, orderRef: rec?.orderRef ?? "" };
  }
  const raw = await gwFetch<Json>(`/api/gateway/v1/invoices/${encodeURIComponent(invoiceId)}`, { method: "GET" });
  const d: Json = raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
  const st = String(d.status ?? d.state ?? "pending").toLowerCase();
  return {
    status: st === "paid" || st === "success" || st === "succeeded" ? "paid"
      : st === "failed" || st === "cancelled" || st === "canceled" || st === "expired" ? "failed" : "pending",
    amount: Number(d.amount ?? 0),
    orderRef: d.orderRef ?? d.order_ref ?? "",
    paidAt: d.paidAt ?? d.paid_at ?? null,
  };
}

// 3) Verify a Botxon webhook signature: header `X-Botxon-Signature: sha256=<hex>`
//    where <hex> = HMAC-SHA256(raw_body, BOTXON_WEBHOOK_SECRET). Constant-time.
export function verifyBotxonSignature(rawBody: string, sigHeader: string | null, secret?: string): boolean {
  if (!sigHeader || !secret) return false;
  const provided = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
