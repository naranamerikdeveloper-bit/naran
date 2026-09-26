import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { posCreateInvoice, posInvoiceStatus } from "../../../../lib/pos-payment";
import { buildTicket, pricesForVariants } from "../../../../lib/catalog";

// QPay at the till.
//   POST /admin/offline-sale/qpay  { items, discount? } → mint an invoice (QR +
//        bank deeplinks) for the ticket's total, which the server recomputes.
//   GET  /admin/offline-sale/qpay?invoiceId=… → poll until it reports "paid".
//
// Paying does NOT create the order: the POS records the sale through
// POST /admin/offline-sale, which re-checks this invoice server-side first, so a
// sale can never be booked against an unpaid (or cheaper) invoice.

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i: any) => ({
      variant_id: String(i.variant_id || ""),
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      title: String(i.title || "Бараа").slice(0, 200),
    }))
    .filter((i: any) => i.variant_id);
  if (!items.length) {
    res.status(400).json({ message: "Дор хаяж нэг бараа сонгоно уу." });
    return;
  }

  // Price from the catalogue, never from the request — the same arithmetic the
  // sale endpoint uses, so the invoice and the booked order agree to the tögrög.
  const prices = await pricesForVariants(req.scope, items.map((i: any) => i.variant_id));
  const missing = items.filter((i: any) => !prices.has(i.variant_id));
  if (missing.length) {
    res.status(409).json({ message: `Үнэгүй бараа байна: ${missing.map((m: any) => m.title).join(", ")}` });
    return;
  }
  const { scaledTotal: amount } = buildTicket(items, prices, body?.discount);
  if (amount <= 0) {
    res.status(400).json({ message: "Төлөх дүн 0 байна." });
    return;
  }

  const orderRef = `POS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  try {
    const invoice = await posCreateInvoice(amount, orderRef, `NARAN дэлгүүр · ${orderRef}`);
    res.json({ invoice, amount, orderRef });
  } catch (e: any) {
    res.status(502).json({ message: e?.message || "QPay нэхэмжлэх үүсгэж чадсангүй" });
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const invoiceId = String(req.query.invoiceId || "");
  if (!invoiceId) {
    res.status(400).json({ message: "invoiceId шаардлагатай" });
    return;
  }
  try {
    const status = await posInvoiceStatus(invoiceId);
    res.json(status);
  } catch (e: any) {
    res.status(502).json({ message: e?.message || "Төлбөрийн төлөв шалгаж чадсангүй" });
  }
}
