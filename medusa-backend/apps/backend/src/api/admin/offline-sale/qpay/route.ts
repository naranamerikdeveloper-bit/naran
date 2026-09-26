import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { posCreateInvoice, posInvoiceStatus } from "../../../../lib/pos-payment";

// QPay at the till.
//   POST /admin/offline-sale/qpay  { items, discount? } → mint an invoice (QR +
//        bank deeplinks) for the ticket's total, which the server recomputes.
//   GET  /admin/offline-sale/qpay?invoiceId=… → poll until it reports "paid".
//
// Paying does NOT create the order: the POS records the sale through
// POST /admin/offline-sale, which re-checks this invoice server-side first, so a
// sale can never be booked against an unpaid (or cheaper) invoice.

// Same arithmetic the sale endpoint uses, so the invoice and the recorded order
// always agree to the tögrög.
export function ticketTotal(body: any): number {
  const items = (Array.isArray(body?.items) ? body.items : [])
    .map((i: any) => ({
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      unit_price: Math.max(0, Math.round(Number(i.unit_price) || 0)),
    }));
  const rawTotal = items.reduce((a: number, i: any) => a + i.unit_price * i.quantity, 0);
  const discount = Math.min(rawTotal, Math.max(0, Math.round(Number(body?.discount) || 0)));
  const factor = discount > 0 && rawTotal > 0 ? (rawTotal - discount) / rawTotal : 1;
  return items.reduce((a: number, i: any) => a + Math.max(0, Math.round(i.unit_price * factor)) * i.quantity, 0);
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ message: "Дор хаяж нэг бараа сонгоно уу." });
    return;
  }
  const amount = ticketTotal(body);
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
