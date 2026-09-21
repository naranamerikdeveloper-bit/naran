import { Router, raw, type Request, type Response } from "express";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import {
  createPaymentIntent, getPaymentIntent, createCheckoutSession,
  verifyWireSignature, WIRE_LIVE, WIRE_WEBHOOK_IP,
} from "../lib/wire.js";
import {
  createInvoice as botxonCreateInvoice, getInvoice as botxonGetInvoice,
  verifyBotxonSignature, BOTXON_LIVE, type BotxonInvoice,
} from "../lib/botxon.js";
import { sendOrderConfirmation } from "../lib/email.js";
import { rateLimit } from "../lib/rate-limit.js";

const MEDUSA_URL = process.env.MEDUSA_URL || "http://localhost:9000";
// No baked-in fallback: a wrong/absent key must fail loudly, not silently use a
// key that won't match the deployed Medusa DB (H6). Dev may still export a local one.
const MEDUSA_PK = process.env.MEDUSA_PK || "";
if (!MEDUSA_PK && process.env.NODE_ENV === "production") {
  throw new Error("MEDUSA_PK is required in production (Medusa publishable key).");
}

type OrderItem = { title: string; quantity: number; amount: number };
type Record = {
  cartId: string;
  amount: number;
  email: string;
  shippingMethod: "standard" | "express";
  // pending      → payment not yet captured (or completion still being retried)
  // paid         → cart completed into a real order
  // needs_review → Wire captured money but the cart could not be completed after
  //                MAX_SETTLE_ATTEMPTS (e.g. out of stock); flagged for a human.
  // failed       → the gateway reported the payment failed (Botxon only); stop polling.
  status: "pending" | "paid" | "needs_review" | "failed";
  attempts?: number;   // completion attempts made (across polls/webhook)
  emailed?: boolean;   // guard: send the confirmation email exactly once
  reported?: boolean;  // guard: alert on an unfulfilled paid order exactly once
  order?: { id: string; total: number; email: string; estimatedDelivery: string; items: OrderItem[] };
  invoice?: BotxonInvoice; // Botxon: QR + bank deeplinks, so the pay page can re-render them
};
const intents = new Map<string, Record>();

// How many times we retry completing a paid cart (across poll ticks + webhook)
// before giving up and flagging for manual reconciliation. A transient backend
// blip self-heals within these; a permanent failure (out of stock) ends here.
const MAX_SETTLE_ATTEMPTS = 5;

// Dedupe concurrent settle() calls for the same intent — the storefront poll and
// the Wire webhook can both fire at once; without this they'd race to complete
// the same cart and double-send the confirmation email (H4).
const inFlight = new Map<string, Promise<Record | null>>();

// A paid order that could not be turned into a Medusa order MUST NOT vanish: the
// customer's money is already captured in Wire. Alert loudly (Sentry + structured
// log) with everything an operator needs to reconcile or refund by hand. Fires
// once per intent.
function reportUnfulfilledPayment(intentId: string, rec: Record, err: Error) {
  if (rec.reported) return;
  rec.reported = true;
  const detail = { intentId, cartId: rec.cartId, email: rec.email, amount: rec.amount, error: err.message };
  console.error(`[settle] PAID BUT UNFULFILLED — manual reconciliation needed:`, JSON.stringify(detail));
  try {
    Sentry.captureException(err, { level: "fatal", tags: { kind: "paid_unfulfilled" }, extra: detail });
  } catch { /* Sentry no-op without DSN */ }
}

// Authoritative amount: the cart's server-side total (never trust a client-sent
// amount — otherwise a buyer could pay less than the order is worth).
async function cartTotal(cartId: string): Promise<number> {
  const res = await fetch(`${MEDUSA_URL}/store/carts/${cartId}?fields=id,total,currency_code`, {
    headers: { "content-type": "application/json", "x-publishable-api-key": MEDUSA_PK },
  });
  const data: any = await res.json().catch(() => ({}));
  const total = data?.cart?.total;
  if (typeof total !== "number" || !Number.isFinite(total)) throw new Error("Cart not found");
  return Math.round(total);
}

// Pre-payment stock guard (B3). Returns the titles of any cart lines whose
// managed inventory is already short of the requested quantity, so we can refuse
// to charge for something we cannot fulfil. FAIL-OPEN by design: if the cart or
// its inventory data can't be read (field unsupported, backend blip, unmanaged
// variant), it returns [] and the charge proceeds — this can only ever BLOCK a
// clearly out-of-stock purchase, never a valid one. The residual millisecond
// race (two buyers of the last unit both passing here) is still caught safely by
// settle() → needs_review, so no paid order is ever lost.
async function cartStockShortfall(cartId: string): Promise<string[]> {
  try {
    const fields =
      "items.quantity,items.title,items.product_title,items.variant.manage_inventory,items.variant.inventory_items.inventory.location_levels.available_quantity";
    const res = await fetch(`${MEDUSA_URL}/store/carts/${cartId}?fields=${encodeURIComponent(fields)}`, {
      headers: { "content-type": "application/json", "x-publishable-api-key": MEDUSA_PK },
    });
    const data: any = await res.json().catch(() => ({}));
    const items = data?.cart?.items;
    if (!Array.isArray(items) || !items.length) return []; // unknown → allow
    const short: string[] = [];
    for (const it of items) {
      const v = it?.variant;
      if (!v || v.manage_inventory === false) continue;         // unlimited → skip
      const levels = (v.inventory_items || []).flatMap((ii: any) => ii?.inventory?.location_levels || []);
      if (!levels.length) continue;                              // no data → allow this line
      const available = levels.reduce((a: number, l: any) => a + Number(l?.available_quantity ?? 0), 0);
      if (available < Number(it.quantity || 0)) short.push(it.product_title || it.title || "Бараа");
    }
    return short;
  } catch {
    return []; // any error → fail open, never block a valid checkout
  }
}

// Complete the Medusa cart (already has address + shipping + payment session) → real order
async function completeMedusaCart(cartId: string, shippingMethod: "standard" | "express") {
  const res = await fetch(`${MEDUSA_URL}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-publishable-api-key": MEDUSA_PK },
    body: "{}",
  });
  const data: any = await res.json().catch(() => ({}));
  if (data?.type !== "order") throw new Error(data?.message || "Cart completion failed");
  const o = data.order;
  return {
    id: o.display_id ? `NT-${o.display_id}` : o.id,
    total: Math.round(o.total),
    email: o.email,
    estimatedDelivery: new Date(Date.now() + (shippingMethod === "express" ? 2 : 4) * 86400000).toISOString().slice(0, 10),
    items: (o.items || []).map((it: any): OrderItem => ({
      title: it.product_title || it.title || "Item",
      quantity: it.quantity,
      amount: Math.round(Number(it.total ?? it.unit_price * it.quantity) || 0),
    })),
  };
}

// Trim an order for the UNAUTHENTICATED status poll: drop the line items so a
// leaked/guessed intent or invoice id can't reveal what a customer bought. The
// storefront renders items from its own local cart, so this omits nothing it
// needs (id/total/email/ETA are still returned).
function publicOrder(o?: Record["order"]) {
  return o ? { id: o.id, total: o.total, email: o.email, estimatedDelivery: o.estimatedDelivery } : null;
}

function settle(intentId: string): Promise<Record | null> {
  const cached = intents.get(intentId);
  if (cached?.status === "paid") return Promise.resolve(cached);
  // Coalesce concurrent callers (poll + webhook) onto one in-flight settlement.
  const running = inFlight.get(intentId);
  if (running) return running;
  const p = doSettle(intentId).finally(() => inFlight.delete(intentId));
  inFlight.set(intentId, p);
  return p;
}

async function doSettle(intentId: string): Promise<Record | null> {
  const cached = intents.get(intentId);
  if (cached?.status === "paid") return cached;

  const intent = await getPaymentIntent(intentId);
  // Recover the intent's details from Wire's stored metadata when the local
  // cache is cold — i.e. the api restarted or another instance handled /intent.
  // Wire (the payment provider) is the durable source of truth, so no local
  // persistence is needed; completing the cart is idempotent on Medusa's side.
  const meta = (intent?.metadata || {}) as { cartId?: string; email?: string; shippingMethod?: string };
  const cartId = cached?.cartId ?? meta.cartId;
  if (!cartId) return null; // unknown intent (nothing to settle)
  const email = cached?.email ?? meta.email ?? "";
  const shippingMethod = (cached?.shippingMethod ?? meta.shippingMethod ?? "standard") as "standard" | "express";

  const rec: Record = cached ?? { cartId, amount: 0, email, shippingMethod, status: "pending", attempts: 0 };

  // Payment not captured yet → nothing to do (still "pending").
  if (intent.status !== "succeeded") { intents.set(intentId, rec); return rec; }
  if (rec.status === "paid") return rec;

  // Wire has the money. Turn the cart into a real Medusa order. This is the
  // money-critical step: on failure we retry (transient) and, if it persists,
  // flag for reconciliation rather than losing a paid order (B2).
  rec.attempts = (rec.attempts ?? 0) + 1;
  try {
    const order = await completeMedusaCart(cartId, shippingMethod); // idempotent: same cart → same order
    rec.order = order;
    rec.amount = order.total;
    rec.status = "paid";
    // M2 — the amount captured in Wire must equal the order total. A mismatch
    // means cart pricing changed between charge and completion; alert, don't block.
    const captured = typeof intent.amount === "number" ? Math.round(intent.amount) : null;
    if (captured != null && captured !== order.total) {
      console.error(`[settle] amount mismatch intent=${intentId} captured=${captured} order=${order.total}`);
      try { Sentry.captureMessage(`Wire amount mismatch: intent ${intentId} captured ${captured} vs order ${order.total}`, "warning"); } catch { /* no DSN */ }
    }
    if (!rec.emailed) { rec.emailed = true; sendOrderConfirmation(order).catch(() => {}); } // once
  } catch (e: any) {
    // Paid but not completed. Keep it retryable across the next poll ticks; once
    // we've exhausted attempts it's almost certainly permanent (e.g. out of
    // stock) → alert for manual reconciliation. Never silently drop it.
    rec.status = "needs_review";
    if (rec.attempts >= MAX_SETTLE_ATTEMPTS) reportUnfulfilledPayment(intentId, rec, e);
    else console.error(`[settle] completion attempt ${rec.attempts}/${MAX_SETTLE_ATTEMPTS} failed for cart ${cartId}: ${e.message}`);
  }
  intents.set(intentId, rec);
  return rec;
}

/* ============================ Botxon gateway ============================ */
// Same money-critical guarantees as Wire above — reuses completeMedusaCart,
// reportUnfulfilledPayment, cartStockShortfall and the needs_review flow — but
// for Botxon's invoice/QR model. Keyed by invoiceId; the order ref IS the cart
// id, so a cold restart can still complete via getInvoice(orderRef).
const invoices = new Map<string, Record>();
const botxonInFlight = new Map<string, Promise<Record | null>>();

function settleBotxon(invoiceId: string): Promise<Record | null> {
  const cached = invoices.get(invoiceId);
  if (cached?.status === "paid") return Promise.resolve(cached);
  const running = botxonInFlight.get(invoiceId);
  if (running) return running;
  const p = doSettleBotxon(invoiceId).finally(() => botxonInFlight.delete(invoiceId));
  botxonInFlight.set(invoiceId, p);
  return p;
}

async function doSettleBotxon(invoiceId: string): Promise<Record | null> {
  const cached = invoices.get(invoiceId);
  if (cached?.status === "paid") return cached;

  // Botxon is the source of truth — re-check even when a webhook triggered us.
  const inv = await botxonGetInvoice(invoiceId);
  const cartId = cached?.cartId ?? inv.orderRef;
  if (!cartId) return null; // unknown invoice

  const rec: Record =
    cached ?? { cartId, amount: Math.round(inv.amount || 0), email: "", shippingMethod: "standard", status: "pending", attempts: 0 };

  // Terminal failure from the gateway → stop polling, no order.
  if (inv.status === "failed") { rec.status = "failed"; invoices.set(invoiceId, rec); return rec; }
  if (inv.status !== "paid") { invoices.set(invoiceId, rec); return rec; }
  if (rec.status === "paid") return rec;

  // Money is in. Turn the cart into a Medusa order (idempotent); on persistent
  // failure flag for reconciliation rather than losing a paid order (B2).
  rec.attempts = (rec.attempts ?? 0) + 1;
  try {
    const order = await completeMedusaCart(cartId, rec.shippingMethod);
    rec.order = order;
    rec.amount = order.total;
    rec.status = "paid";
    // Amount integrity: what Botxon collected must equal the order total.
    const paid = typeof inv.amount === "number" ? Math.round(inv.amount) : null;
    if (paid != null && paid !== order.total) {
      console.error(`[botxon] amount mismatch invoice=${invoiceId} paid=${paid} order=${order.total}`);
      try { Sentry.captureMessage(`Botxon amount mismatch: invoice ${invoiceId} paid ${paid} vs order ${order.total}`, "warning"); } catch { /* no DSN */ }
    }
    if (!rec.emailed) { rec.emailed = true; sendOrderConfirmation(order).catch(() => {}); }
  } catch (e: any) {
    rec.status = "needs_review";
    if (rec.attempts >= MAX_SETTLE_ATTEMPTS) reportUnfulfilledPayment(invoiceId, rec, e);
    else console.error(`[botxon] completion attempt ${rec.attempts}/${MAX_SETTLE_ATTEMPTS} failed for cart ${cartId}: ${e.message}`);
  }
  invoices.set(invoiceId, rec);
  return rec;
}

const router = Router();

const intentSchema = z.object({
  cartId: z.string().min(1),
  // `amount` is accepted for backwards-compat but IGNORED — the charge amount is
  // always the cart's server-side total (see cartTotal), so it can't be tampered.
  amount: z.number().int().nonnegative().optional(),
  email: z.string().email(),
  shippingMethod: z.enum(["standard", "express"]).default("standard"),
  origin: z.string().url().optional(),
});

// Create Wire intent + hosted checkout session. Rate-limited (H9): intent
// creation is expensive/abusable; the status poll below is not limited.
const intentCreateLimit = rateLimit({ name: "pay-intent", windowMs: 60_000, max: 12 });
router.post("/intent", intentCreateLimit, async (req, res) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cartId, email, shippingMethod, origin } = parsed.data;
  try {
    // Stock guard (B3): refuse to start a payment for a cart that already can't be
    // fulfilled, so the customer is told BEFORE they pay — not left with a captured
    // charge and no order. Fail-open (see cartStockShortfall); the rare residual
    // race is still caught by settle() → needs_review, so money is never lost.
    const short = await cartStockShortfall(cartId);
    if (short.length) {
      return res.status(409).json({
        error: "out_of_stock",
        items: short,
        message: `Уучлаарай, дараах бараа дууссан байна: ${short.join(", ")}. Сагсаа шинэчилнэ үү.`,
      });
    }
    // Authoritative amount from the cart, not the client. This also confirms the
    // cart still exists/prices before we charge.
    const amount = await cartTotal(cartId);
    const intent = await createPaymentIntent({
      amount, idempotencyKey: `cart_${cartId}`,
      // Metadata is the durable record used to settle after an api restart.
      metadata: { cartId, email, shippingMethod },
    });
    const base = origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const session = await createCheckoutSession({
      paymentIntentId: intent.id,
      successUrl: `${base}/checkout/processing?pi=${intent.id}`,
      idempotencyKey: `sess_${cartId}`,
    });
    intents.set(intent.id, { cartId, amount, email, shippingMethod, status: "pending" });
    res.json({ data: { intentId: intent.id, checkoutUrl: session.url, live: WIRE_LIVE } });
  } catch (e: any) {
    console.error("wire intent error:", e.message);
    res.status(502).json({ error: "Payment could not be started" });
  }
});

// Poll status — completes the Medusa order once Wire reports success
router.get("/intent", async (req, res) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const rec = await settle(id);
    if (!rec) return res.status(404).json({ error: "intent not found" });
    // "review" = paid but we couldn't complete after all retries; tell the
    // storefront to stop polling and show the "we've got your payment, confirming
    // your order" message instead of spinning until timeout.
    const exhausted = rec.status === "needs_review" && (rec.attempts ?? 0) >= MAX_SETTLE_ATTEMPTS;
    const status = rec.status === "paid" ? "succeeded" : exhausted ? "review" : "pending";
    res.json({ data: { status, order: publicOrder(rec.order) } });
  } catch (e: any) {
    console.error("wire settle error:", e.message);
    res.status(502).json({ error: "Could not verify payment" });
  }
});

/* ---- Botxon: create invoice (QR) + poll status ---- */
const botxonInvoiceSchema = z.object({
  cartId: z.string().min(1),
  email: z.string().email(),
  shippingMethod: z.enum(["standard", "express"]).default("standard"),
  description: z.string().max(200).optional(),
});

// Reuse the payment-start limiter (invoice creation is the abusable step).
router.post("/botxon/invoice", intentCreateLimit, async (req, res) => {
  const parsed = botxonInvoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cartId, email, shippingMethod, description } = parsed.data;
  try {
    // Stock guard (B3): never invoice for a cart we can't fulfil.
    const short = await cartStockShortfall(cartId);
    if (short.length) {
      return res.status(409).json({
        error: "out_of_stock", items: short,
        message: `Уучлаарай, дараах бараа дууссан байна: ${short.join(", ")}. Сагсаа шинэчилнэ үү.`,
      });
    }
    // Authoritative amount from the cart, never the client.
    const amount = await cartTotal(cartId);
    // customerRef is Botxon's optional QPay receiver code (a phone), NOT an email
    // — omit it rather than send a wrongly-shaped value. orderRef (the cart id)
    // already links the payment back to the order (which carries the email).
    const invoice = await botxonCreateInvoice({
      amount, description: description || `NARAN order ${cartId}`,
      orderRef: cartId,
    });
    invoices.set(invoice.invoiceId, { cartId, amount, email, shippingMethod, status: "pending", attempts: 0, invoice });
    res.json({ data: {
      invoiceId: invoice.invoiceId, qrText: invoice.qrText, qrImage: invoice.qrImage,
      shortUrl: invoice.shortUrl, urls: invoice.urls, live: BOTXON_LIVE,
    } });
  } catch (e: any) {
    console.error("botxon invoice error:", e.message);
    res.status(502).json({ error: "Payment could not be started" });
  }
});

router.get("/botxon/invoice", async (req, res) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const rec = await settleBotxon(id);
    if (!rec) return res.status(404).json({ error: "invoice not found" });
    const exhausted = rec.status === "needs_review" && (rec.attempts ?? 0) >= MAX_SETTLE_ATTEMPTS;
    const status =
      rec.status === "paid" ? "succeeded" :
      rec.status === "failed" ? "failed" :
      exhausted ? "review" : "pending";
    res.json({ data: { status, order: publicOrder(rec.order), invoice: rec.invoice ?? null } });
  } catch (e: any) {
    console.error("botxon settle error:", e.message);
    // A transient gateway error must not end the customer's payment session:
    // for an invoice we issued, keep reporting "pending" so the QR stays up and
    // the next poll (or the webhook) can still settle it.
    const known = invoices.get(id);
    if (known && known.status !== "failed") {
      return res.json({ data: { status: "pending", order: null, invoice: known.invoice ?? null } });
    }
    res.status(502).json({ error: "Could not verify payment" });
  }
});

export default router;

// Webhook (mounted with raw body in index.ts)
function clientIp(req: Request): string {
  const xff = (req.headers["x-forwarded-for"] as string) || "";
  return xff.split(",")[0].trim() || req.socket.remoteAddress || "";
}
export async function wireWebhook(req: Request, res: Response) {
  const rawBody = (req.body as Buffer)?.toString("utf8") || "";
  const secret = process.env.WIRE_WEBHOOK_SECRET;
  // In live mode the webhook MUST be authenticated. Refuse if misconfigured
  // rather than trusting an unsigned request. (settle() re-verifies with Wire
  // regardless, but this closes the gap for good.)
  if (WIRE_LIVE && !secret) {
    console.error("wire webhook: WIRE_WEBHOOK_SECRET not set in live mode — refusing");
    return res.status(500).json({ error: "Webhook not configured" });
  }
  if (secret) {
    if (clientIp(req) !== WIRE_WEBHOOK_IP) return res.status(403).json({ error: "Forbidden" });
    if (!verifyWireSignature(rawBody, (req.headers["wirepayment-signature"] as string) || null, secret))
      return res.status(400).json({ error: "Invalid signature" });
  }
  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.json({ received: true }); }
  if (event?.type === "payment_intent.succeeded") {
    const intentId = (event.data?.object ?? event.data)?.id;
    if (intentId) { try { await settle(intentId); } catch (e: any) { console.error("webhook settle:", e.message); } }
  }
  res.json({ received: true });
}

// Botxon webhook: POST { event:"invoice.paid", invoiceId, orderRef, amount, paymentId }
// with header `X-Botxon-Signature: sha256=HMAC(raw_body, BOTXON_WEBHOOK_SECRET)`.
export async function botxonWebhook(req: Request, res: Response) {
  const rawBody = (req.body as Buffer)?.toString("utf8") || "";
  const secret = process.env.BOTXON_WEBHOOK_SECRET;
  // Live mode MUST be signed. Refuse if misconfigured rather than trusting it.
  if (BOTXON_LIVE && !secret) {
    console.error("botxon webhook: BOTXON_WEBHOOK_SECRET not set in live mode — refusing");
    return res.status(500).json({ error: "Webhook not configured" });
  }
  if (secret) {
    const sig = (req.headers["x-botxon-signature"] as string) || null;
    if (!verifyBotxonSignature(rawBody, sig, secret)) return res.status(400).json({ error: "Invalid signature" });
  }
  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.json({ received: true }); }
  if (event?.event === "invoice.paid" && event?.invoiceId) {
    // Defense in depth: the webhook's amount must match what we invoiced. Don't
    // settle a mismatched amount — leave it to the status poll / manual review.
    // (settleBotxon re-verifies against the completed order total regardless.)
    const rec = invoices.get(event.invoiceId);
    if (rec && typeof event.amount === "number" && Math.round(event.amount) !== rec.amount) {
      console.error(`[botxon] webhook amount mismatch invoice=${event.invoiceId} webhook=${event.amount} expected=${rec.amount}`);
      try { Sentry.captureMessage(`Botxon webhook amount mismatch invoice ${event.invoiceId}`, "warning"); } catch { /* no DSN */ }
      return res.json({ received: true });
    }
    try { await settleBotxon(event.invoiceId); } catch (e: any) { console.error("botxon webhook settle:", e.message); }
  }
  res.json({ received: true });
}
