import { createHash } from "crypto";

// QPay for the till. The payments gateway owns the Botxon credentials, so Medusa
// asks it to mint/inspect an invoice over the internal network, proving itself
// with the shared secret (the same handshake the gateway uses to complete carts,
// in the other direction).
//
// POS invoices are standalone: there is no cart for the gateway to complete, so
// nothing is auto-settled. Medusa polls the status and records the in-store
// order itself only once the invoice reports "paid".

const GATEWAY = (process.env.PAYMENTS_API_URL || "http://api:4000").replace(/\/$/, "");

function internalToken(): string {
  const secret = process.env.INTERNAL_API_SECRET || "";
  return createHash("sha256").update(`naran-internal:${secret}`).digest("hex");
}

export type PosInvoice = {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  shortUrl: string;
  urls: { name?: string; description?: string; logo?: string; link: string }[];
  amount: number;
};

export type PosInvoiceStatus = { status: "pending" | "paid" | "failed"; amount: number; orderRef: string; paidAt?: string | null };

async function call(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${GATEWAY}/api/payments${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-naran-internal": internalToken(),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Payment gateway error (${res.status})`);
  return data;
}

export async function posCreateInvoice(amount: number, orderRef: string, description?: string): Promise<PosInvoice> {
  return call("/pos/invoice", {
    method: "POST",
    body: JSON.stringify({ amount, orderRef, ...(description ? { description } : {}) }),
  });
}

export async function posInvoiceStatus(invoiceId: string): Promise<PosInvoiceStatus> {
  return call(`/pos/invoice?id=${encodeURIComponent(invoiceId)}`);
}
