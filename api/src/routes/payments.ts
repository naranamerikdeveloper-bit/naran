import { Router, raw, type Request, type Response, type NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createInvoice as botxonCreateInvoice, getInvoice as botxonGetInvoice,
  verifyBotxonSignature, BOTXON_LIVE, type BotxonInvoice,
} from "../lib/botxon.js";
import { sendOrderConfirmation } from "../lib/email.js";
import { rateLimit } from "../lib/rate-limit.js";
import { putRecord, getRecord, pendingIds, dropPending, claimOnce, releaseClaim } from "../lib/store.js";

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
  // needs_review → the gateway captured money but the cart could not be completed after
  //                MAX_SETTLE_ATTEMPTS (e.g. out of stock); flagged for a human.
  // failed       → the gateway reported the payment failed (Botxon only); stop polling.
  status: "pending" | "paid" | "needs_review" | "failed";
  attempts?: number;   // completion attempts made (across polls/webhook)
  emailed?: boolean;   // guard: send the confirmation email exactly once
  reported?: boolean;  // guard: alert on an unfulfilled paid order exactly once
  order?: { id: string; total: number; email: string; estimatedDelivery: string; items: OrderItem[] };
  invoice?: BotxonInvoice; // Botxon: QR + bank deeplinks, so the pay page can re-render them
  createdAt?: number;      // ms epoch — bounds background reconciliation
};

// How many times we retry completing a paid cart (across poll ticks + webhook)
// before giving up and flagging for manual reconciliation. A transient backend
// blip self-heals within these; a permanent failure (out of stock) ends here.
const MAX_SETTLE_ATTEMPTS = 5;

// A paid order that could not be turned into a Medusa order MUST NOT vanish: the
// customer's money is already captured by the gateway. Alert loudly (Sentry + structured
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
// Network-level failure → worth retrying; doesn't count as a completion attempt.
const transient = (e: any) => Object.assign(new Error(e?.message || "network error"), { transient: true });

async function cartTotal(cartId: string): Promise<number> {
  const res = await fetch(`${MEDUSA_URL}/store/carts/${cartId}?fields=id,total,currency_code`, {
    // Without a timeout a wedged Medusa holds this for minutes, and the
    // reconciler is sequential — one stuck invoice blocks every other one.
    signal: AbortSignal.timeout(8_000),
    headers: { "content-type": "application/json", "x-publishable-api-key": MEDUSA_PK },
  }).catch((e) => { throw transient(e); });
  if (res.status >= 500) throw transient(new Error(`Medusa ${res.status}`));
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
      signal: AbortSignal.timeout(8_000),
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
// Medusa only lets carts be completed by us (see its middlewares internalOnly):
// prove it with sha256("naran-internal:" + INTERNAL_API_SECRET).
const INTERNAL_TOKEN = process.env.INTERNAL_API_SECRET
  ? createHash("sha256").update(`naran-internal:${process.env.INTERNAL_API_SECRET}`).digest("hex")
  : "";
if (!INTERNAL_TOKEN && process.env.NODE_ENV === "production") {
  throw new Error("INTERNAL_API_SECRET is required in production (cart completion auth).");
}

async function completeMedusaCart(cartId: string, shippingMethod: "standard" | "express") {
  const res = await fetch(`${MEDUSA_URL}/store/carts/${cartId}/complete`, {
    method: "POST",
    // Completion can be slow, but not unbounded — see cartTotal.
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "x-publishable-api-key": MEDUSA_PK, "x-naran-internal": INTERNAL_TOKEN },
    body: "{}",
  }).catch((e) => { throw transient(e); });
  const data: any = await res.json().catch(() => ({}));
  if (data?.type !== "order") {
    const err: any = new Error(data?.message || `Cart completion failed (${res.status})`);
    if (res.status >= 500) err.transient = true;
    throw err;
  }
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

/* ============================ Botxon gateway ============================ */
// Botxon (QPay / bank apps) is the only payment gateway. Uses completeMedusaCart,
// reportUnfulfilledPayment, cartStockShortfall and the needs_review flow for its
// invoice/QR model. Keyed by invoiceId; the order ref IS the cart
// id, so a cold restart can still complete via getInvoice(orderRef).
// In-memory cache in front of the durable store (lib/store — Redis). Every
// write goes through saveInvoice so a restart never loses a payment record.
const invoices = new Map<string, Record>();
const botxonInFlight = new Map<string, Promise<Record | null>>();

// Still worth a background re-check with Botxon (money may land later).
const isOpen = (r: Record) =>
  r.status === "pending" || (r.status === "needs_review" && (r.attempts ?? 0) < MAX_SETTLE_ATTEMPTS);

function saveInvoice(id: string, rec: Record) {
  invoices.set(id, rec);
  void putRecord(id, rec, isOpen(rec));
  // Every record is evicted from memory eventually — Redis remains the durable
  // copy and loadInvoice re-hydrates on demand. Open records get a longer lease
  // because they're actively polled; without this an abandoned checkout leaked
  // a Map entry for the life of the process (OOM against the 256MB limit).
  const ttl = isOpen(rec) ? 60 * 60_000 : 15 * 60_000;
  setTimeout(() => { if (invoices.get(id) === rec) invoices.delete(id); }, ttl).unref();
}

async function loadInvoice(id: string): Promise<Record | undefined> {
  const hit = invoices.get(id);
  if (hit) return hit;
  const stored = await getRecord<Record>(id);
  if (stored) invoices.set(id, stored);
  return stored ?? undefined;
}

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
  const cached = await loadInvoice(invoiceId);
  // An in-store invoice has no cart to complete — the till books the order
  // itself once it claims the payment. Without this, every POS sale is dragged
  // through cart settlement, fails "cart not found", and eventually raises a
  // false "PAID BUT UNFULFILLED" alert.
  if ((cached as any)?.kind === "pos") return null;
  if (cached?.status === "paid") return cached;

  // Botxon is the source of truth — re-check even when a webhook triggered us.
  const inv = await botxonGetInvoice(invoiceId);
  const cartId = cached?.cartId ?? inv.orderRef;
  if (!cartId) return null; // unknown invoice
  // Belt and braces: an orderRef we've never recorded that isn't a Medusa cart
  // id (POS refs, anything else on the shared gateway account) is not ours.
  if (!cached && !cartId.startsWith("cart_")) return null;

  const rec: Record =
    cached ?? { cartId, amount: Math.round(inv.amount || 0), email: "", shippingMethod: "standard", status: "pending", attempts: 0, createdAt: Date.now() };

  // Terminal failure from the gateway → stop polling, no order.
  if (inv.status === "failed") { rec.status = "failed"; saveInvoice(invoiceId, rec); return rec; }
  if (inv.status !== "paid") { saveInvoice(invoiceId, rec); return rec; }
  if (rec.status === "paid") return rec;

  // Money is in. Turn the cart into a Medusa order (idempotent); on persistent
  // failure flag for reconciliation rather than losing a paid order (B2).
  const mismatch = (e: Error) => {
    // A human must reconcile/refund: no retries, alert once.
    rec.status = "needs_review";
    rec.attempts = MAX_SETTLE_ATTEMPTS;
    reportUnfulfilledPayment(invoiceId, rec, e);
  };
  // What was collected: Botxon's reported amount, else what we invoiced. A
  // missing amount must not lock every payment into manual review.
  // Never fall back to our OWN invoiced figure here: comparing rec.amount to
  // the cart total is self-referential and would wave a short payment through.
  // A gateway that won't tell us what it collected is a case for a human.
  const reported = Math.round(Number(inv.amount) || 0);
  if (!(reported > 0)) {
    mismatch(new Error(`gateway reported no amount for a paid invoice — manual check required`));
    return rec;
  }
  const collected = reported;
  try {
    // Amount integrity: the cart stays editable after the invoice is issued, so
    // items could be added after paying a smaller invoice. Only complete when
    // what was collected equals the cart's current total.
    const due = await cartTotal(cartId);
    if (!(collected > 0) || collected !== due) {
      mismatch(new Error(`amount mismatch before completion: paid ${collected}, cart total ${due}`));
      saveInvoice(invoiceId, rec);
      return rec;
    }
    const order = await completeMedusaCart(cartId, rec.shippingMethod);
    rec.order = order;
    rec.amount = order.total;
    if (order.total !== collected) {
      // Cart changed between the check and completion (race): the order exists
      // but must not ship until someone reconciles it.
      mismatch(new Error(`amount mismatch after completion: paid ${collected}, order ${order.total} (${order.id}) — hold fulfilment`));
      saveInvoice(invoiceId, rec);
      return rec;
    }
    rec.status = "paid";
    if (!rec.emailed) { rec.emailed = true; sendOrderConfirmation(order).catch(() => {}); }
  } catch (e: any) {
    rec.status = "needs_review";
    // Transient failures (Medusa restarting, network) don't use up attempts —
    // the poll/reconciler keeps retrying. Only real rejections count.
    if (!e?.transient) rec.attempts = (rec.attempts ?? 0) + 1;
    if (rec.attempts! >= MAX_SETTLE_ATTEMPTS) reportUnfulfilledPayment(invoiceId, rec, e);
    else console.error(`[botxon] completion ${e?.transient ? "transient failure" : `attempt ${rec.attempts}/${MAX_SETTLE_ATTEMPTS} failed`} for cart ${cartId}: ${e.message}`);
  }
  saveInvoice(invoiceId, rec);
  return rec;
}

const router = Router();

// Payment-start limiter (invoice creation is the expensive/abusable step).
// The legacy Wire gateway (/intent + its webhook) was removed: it had no live
// keys in production, so it ran in mock mode and "paid" any cart after 5 s.
const intentCreateLimit = rateLimit({ name: "pay-intent", windowMs: 60_000, max: 12 });

/* ---- Botxon: create invoice (QR) + poll status ---- */
const botxonInvoiceSchema = z.object({
  cartId: z.string().min(1),
  email: z.string().email(),
  shippingMethod: z.enum(["standard", "express"]).default("standard"),
  description: z.string().max(200).optional(),
});

router.post("/botxon/invoice", intentCreateLimit, async (req, res) => {
  const parsed = botxonInvoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cartId, email, shippingMethod } = parsed.data;
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
      amount, description: `NARAN захиалга ${cartId.slice(-8)}` /* fixed text: shown on the QPay invoice */,
      orderRef: cartId,
    });
    saveInvoice(invoice.invoiceId, { cartId, amount, email, shippingMethod, status: "pending", attempts: 0, invoice, createdAt: Date.now() });
    res.json({ data: {
      invoiceId: invoice.invoiceId, qrText: invoice.qrText, qrImage: invoice.qrImage,
      shortUrl: invoice.shortUrl, urls: invoice.urls, live: BOTXON_LIVE,
    } });
  } catch (e: any) {
    console.error("botxon invoice error:", e.message);
    res.status(502).json({ error: "Payment could not be started" });
  }
});

// The pay page polls every 3–6 s; 60/min per client leaves room for a few tabs
// while stopping the poll from being used to hammer the gateway.
const statusLimit = rateLimit({ name: "pay-status", windowMs: 60_000, max: 60 });
router.get("/botxon/invoice", statusLimit, async (req, res) => {
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
    res.json({ data: { status, order: publicOrder(rec.order), invoice: rec.invoice ?? null, amount: rec.amount } });
  } catch (e: any) {
    console.error("botxon settle error:", e.message);
    // A transient gateway error must not end the customer's payment session:
    // for an invoice we issued, keep reporting "pending" so the QR stays up and
    // the next poll (or the webhook) can still settle it.
    const known = await loadInvoice(id);
    if (known && known.status !== "failed") {
      return res.json({ data: { status: "pending", order: null, invoice: known.invoice ?? null } });
    }
    res.status(502).json({ error: "Could not verify payment" });
  }
});

// Background reconciliation: every minute, re-check open invoices with Botxon.
// Completes orders whose money arrived while nobody was polling (tab closed,
// webhook missed, api restarted). Invoices older than 3 h drop out of the set.
const RECONCILE_MS = 60_000;
const RECONCILE_MAX_AGE_MS = 3 * 60 * 60_000;
if (BOTXON_LIVE) {
  let running = false; // never overlap runs
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (const id of await pendingIds()) {
        const rec = await loadInvoice(id);
        if (!rec || !isOpen(rec) || Date.now() - (rec.createdAt ?? 0) > RECONCILE_MAX_AGE_MS) {
          await dropPending(id);
          // loadInvoice just pulled it back into memory — don't leave it there.
          invoices.delete(id);
          continue;
        }
        try { await settleBotxon(id); } catch (e: any) { console.error(`[reconcile] ${id}: ${e.message}`); }
      }
    } finally { running = false; }
  }, RECONCILE_MS).unref();
}

// ---------------------------------------------------------------------------
// POS (in-store) invoices — internal only.
//
// The till asks Medusa for a QPay invoice; Medusa authenticates the cashier and
// computes the authoritative amount, then calls us with the shared internal
// token. These invoices are deliberately NOT part of the cart reconciliation
// pipeline — there is no cart to complete. Medusa polls the status and records
// the in-store order itself once we report the invoice paid.
function internalOnly(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN) {
    if (process.env.NODE_ENV === "production") { res.status(403).json({ error: "Not allowed" }); return; }
    return next(); // local dev without the secret
  }
  const got = Buffer.from(String(req.headers["x-naran-internal"] || ""));
  const want = Buffer.from(INTERNAL_TOKEN);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  next();
}

// POS invoices are recorded so they can be recognised later: the status route
// refuses ids we didn't mint, settlement skips them (there is no cart), and the
// claim below can only succeed once. `kind` is what the cart pipeline checks.
type PosRecord = { kind: "pos"; invoiceId: string; orderRef: string; amount: number; createdAt: number };

// Generous cap: each open till polls every 2.5s, and they all arrive from the
// single Medusa container, so the shared status limiter would throttle a
// second/third till. These routes are already gated by the internal secret.
const posLimit = rateLimit({ name: "pay-pos", windowMs: 60_000, max: 600 });

const posInvoiceSchema = z.object({
  amount: z.number().int().positive().max(100_000_000),
  orderRef: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
});

router.post("/pos/invoice", internalOnly, posLimit, async (req, res) => {
  const parsed = posInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const { amount, orderRef, description } = parsed.data;
  try {
    const inv = await botxonCreateInvoice({
      amount,
      orderRef,
      description: description || `NARAN POS ${orderRef}`,
    });
    const rec: PosRecord = { kind: "pos", invoiceId: inv.invoiceId, orderRef, amount, createdAt: Date.now() };
    // Not pending: the reconciler settles carts, and a POS invoice has none.
    await putRecord(inv.invoiceId, rec, false);
    res.json({
      invoiceId: inv.invoiceId, qrText: inv.qrText, qrImage: inv.qrImage,
      shortUrl: inv.shortUrl, urls: inv.urls, amount,
    });
  } catch (e) {
    Sentry.captureException(e);
    res.status(502).json({ error: "Нэхэмжлэх үүсгэж чадсангүй" });
  }
});

async function posRecord(id: string): Promise<PosRecord | null> {
  const rec = await getRecord<PosRecord>(id);
  return rec && (rec as any).kind === "pos" ? rec : null;
}

router.get("/pos/invoice", internalOnly, posLimit, async (req, res) => {
  const id = String(req.query.id || "");
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const rec = await posRecord(id);
  // Never proxy an arbitrary invoice id from the merchant's gateway account.
  if (!rec) { res.status(404).json({ error: "Нэхэмжлэх олдсонгүй" }); return; }
  try {
    const st = await botxonGetInvoice(id);
    res.json({ status: st.status, amount: rec.amount, orderRef: rec.orderRef, paidAt: st.paidAt ?? null });
  } catch (e) {
    Sentry.captureException(e);
    res.status(502).json({ error: "Төлөв шалгаж чадсангүй" });
  }
});

/**
 * Claim a paid POS invoice — exactly once.
 *
 * Booking the sale on "status == paid" alone let the same paid invoice be
 * replayed into unlimited orders. The claim is an atomic Redis SET NX, so only
 * the first caller is told to proceed; a sale that then fails to record calls
 * /pos/invoice/release so the cashier can retry.
 */
router.post("/pos/invoice/claim", internalOnly, posLimit, async (req, res) => {
  const id = String((req.body as any)?.invoiceId || "");
  const amount = Math.round(Number((req.body as any)?.amount) || 0);
  if (!id || amount <= 0) { res.status(400).json({ error: "Invalid request" }); return; }

  const rec = await posRecord(id);
  if (!rec) { res.status(404).json({ error: "Нэхэмжлэх олдсонгүй" }); return; }
  if (rec.amount !== amount) {
    res.status(409).json({ error: "Төлсөн дүн тасалбарын дүнтэй таарахгүй байна" });
    return;
  }

  let st: Awaited<ReturnType<typeof botxonGetInvoice>>;
  try {
    st = await botxonGetInvoice(id);
  } catch (e) {
    Sentry.captureException(e);
    res.status(502).json({ error: "Төлбөр шалгаж чадсангүй" });
    return;
  }
  if (st.status !== "paid") { res.status(402).json({ error: "Төлбөр хараахан баталгаажаагүй байна" }); return; }
  // Trust our own minted amount, but refuse if the gateway reports a different
  // (non-zero) figure — a short payment must never book a sale.
  const paid = Math.round(Number(st.amount) || 0);
  if (paid > 0 && paid !== rec.amount) {
    res.status(409).json({ error: "Төлсөн дүн тасалбарын дүнтэй таарахгүй байна" });
    return;
  }

  const claimed = await claimOnce(id);
  if (claimed === null) {
    // No durable store → we cannot promise single use. Fail closed: cash and
    // card still work, and a duplicate free order is worse than a retry.
    res.status(503).json({ error: "Төлбөрийн бүртгэл түр боломжгүй байна" });
    return;
  }
  if (!claimed) { res.status(409).json({ error: "Энэ төлбөрөөр аль хэдийн борлуулалт бүртгэгдсэн байна" }); return; }

  res.json({ ok: true, orderRef: rec.orderRef, amount: rec.amount });
});

router.post("/pos/invoice/release", internalOnly, posLimit, async (req, res) => {
  const id = String((req.body as any)?.invoiceId || "");
  if (!id) { res.status(400).json({ error: "Invalid request" }); return; }
  await releaseClaim(id);
  res.json({ ok: true });
});

export default router;

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
  // Botxon names the invoice id "id" in its API responses; accept either.
  const eventInvoiceId: string | undefined = event?.invoiceId ?? event?.invoice_id ?? event?.id ?? event?.data?.id;
  if (event?.event === "invoice.paid" && eventInvoiceId) {
    // Defense in depth: the webhook's amount must match what we invoiced. Don't
    // settle a mismatched amount — leave it to the status poll / manual review.
    // (settleBotxon re-verifies against the completed order total regardless.)
    const rec = await loadInvoice(eventInvoiceId);
    // Coerce: gateways commonly send the amount as a string ("200000"), and a
    // `typeof === "number"` guard would skip the check entirely for those.
    const eventAmount = Number(event.amount);
    if (rec && Number.isFinite(eventAmount) && Math.round(eventAmount) !== rec.amount) {
      console.error(`[botxon] webhook amount mismatch invoice=${eventInvoiceId} webhook=${event.amount} expected=${rec.amount}`);
      try { Sentry.captureMessage(`Botxon webhook amount mismatch invoice ${eventInvoiceId}`, "warning"); } catch { /* no DSN */ }
      return res.json({ received: true });
    }
    try { await settleBotxon(eventInvoiceId); } catch (e: any) { console.error("botxon webhook settle:", e.message); }
  }
  res.json({ received: true });
}
