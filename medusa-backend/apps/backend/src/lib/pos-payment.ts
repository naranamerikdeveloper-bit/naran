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
    // Never hang a till on a slow gateway.
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      "x-naran-internal": internalToken(),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error((data as any)?.error || `Payment gateway error (${res.status})`);
    err.status = res.status;
    throw err;
  }
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

/**
 * Claim a paid invoice for exactly one sale.
 *
 * Checking "is it paid?" alone let the same payment be replayed into unlimited
 * orders. The gateway does an atomic one-shot claim, so only the first caller is
 * allowed to book; if recording the sale then fails we release it again so the
 * cashier can retry rather than charging the customer twice.
 */
export async function posClaimInvoice(invoiceId: string, amount: number): Promise<{ ok: true; orderRef: string; amount: number }> {
  return call("/pos/invoice/claim", { method: "POST", body: JSON.stringify({ invoiceId, amount }) });
}

export async function posReleaseInvoice(invoiceId: string): Promise<void> {
  try {
    await call("/pos/invoice/release", { method: "POST", body: JSON.stringify({ invoiceId }) });
  } catch { /* best effort — a stuck claim is recoverable, a double charge isn't */ }
}
