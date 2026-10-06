import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { readCustomerMeta, setCustomerMeta } from "./customer-meta";

// A customer's coupon wallet. Discount codes are Medusa promotions; this is the
// record of WHICH customer was given which code, so the storefront can show a
// shopper the coupons they actually hold instead of a public code list.
//
// Lives on customer.metadata.naran_coupons, written through setCustomerMeta so
// it can never clobber the account's other metadata.
//
// `type` / `value` / `expires_at` are a snapshot taken when the code is granted:
// the wallet must still read sensibly if the promotion is later deleted.

const KEY = "naran_coupons";

export type IssuedCoupon = {
  code: string;
  note: string;
  issued_at: string;
  expires_at: string | null;
  used_at: string | null;
  type: "percentage" | "fixed" | null;
  value: number | null;
};

export type WalletCoupon = IssuedCoupon & {
  /** usable | used | expired | inactive (promotion switched off or deleted) */
  state: "usable" | "used" | "expired" | "inactive";
};

const str = (v: any, max = 200) => String(v ?? "").trim().slice(0, max);

function sanitize(raw: any): IssuedCoupon | null {
  const code = str(raw?.code, 64).toUpperCase();
  if (!code) return null;
  const t = raw?.type === "percentage" || raw?.type === "fixed" ? raw.type : null;
  const v = Number(raw?.value);
  return {
    code,
    note: str(raw?.note, 200),
    issued_at: str(raw?.issued_at, 40) || new Date().toISOString(),
    expires_at: str(raw?.expires_at, 40) || null,
    used_at: str(raw?.used_at, 40) || null,
    type: t,
    value: Number.isFinite(v) ? v : null,
  };
}

export async function readWallet(
  scope: { resolve: (k: any) => any },
  customerId: string,
): Promise<IssuedCoupon[]> {
  const meta = await readCustomerMeta(scope, customerId);
  const raw = (meta as any)[KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitize).filter((c): c is IssuedCoupon => !!c).slice(0, 100);
}

async function writeWallet(
  scope: { resolve: (k: any) => any },
  customerId: string,
  coupons: IssuedCoupon[],
): Promise<void> {
  await setCustomerMeta(scope, customerId, { [KEY]: coupons.slice(0, 100) });
}

type Snapshot = { found: boolean; active: boolean; type: IssuedCoupon["type"]; value: number | null; expires_at: string | null };
const MISSING: Snapshot = { found: false, active: false, type: null, value: null, expires_at: null };

// Look codes up so a wallet entry carries a real discount, and so a typo cannot
// be handed out as a coupon that will only be rejected at the checkout, in
// front of the shopper. Batched: a wallet of 20 codes is one query, not 20.
export async function promotionSnapshots(
  scope: { resolve: (k: any) => any },
  codes: string[],
): Promise<Map<string, Snapshot>> {
  const out = new Map<string, Snapshot>();
  const wanted = [...new Set(codes.map(c => str(c, 64).toUpperCase()).filter(Boolean))];
  if (!wanted.length) return out;
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  try {
    const { data } = await query.graph({
      entity: "promotion",
      fields: [
        "id", "code", "status",
        "application_method.type", "application_method.value",
        "campaign.ends_at",
      ],
      filters: { code: wanted } as any,
      pagination: { take: wanted.length },
    });
    for (const p of (data || []) as any[]) {
      const t = p.application_method?.type;
      out.set(String(p.code).toUpperCase(), {
        found: true,
        active: p.status === "active",
        type: t === "percentage" || t === "fixed" ? t : null,
        value: p.application_method?.value != null ? Number(p.application_method.value) : null,
        expires_at: p.campaign?.ends_at ? new Date(p.campaign.ends_at).toISOString() : null,
      });
    }
  } catch { /* promotion module unavailable → every code reads as unknown */ }
  return out;
}

export async function promotionSnapshot(
  scope: { resolve: (k: any) => any },
  code: string,
): Promise<Snapshot> {
  const m = await promotionSnapshots(scope, [code]);
  return m.get(str(code, 64).toUpperCase()) || MISSING;
}

export async function grantCoupon(
  scope: { resolve: (k: any) => any },
  customerId: string,
  code: string,
  note: string,
): Promise<IssuedCoupon[]> {
  const upper = str(code, 64).toUpperCase();
  const snap = await promotionSnapshot(scope, upper);
  const wallet = await readWallet(scope, customerId);
  // Re-granting an existing code refreshes its snapshot rather than duplicating
  // it — the shopper should see one entry, not a growing pile.
  const rest = wallet.filter(c => c.code !== upper);
  const prev = wallet.find(c => c.code === upper);
  const next: IssuedCoupon = {
    code: upper,
    note: str(note, 200),
    issued_at: new Date().toISOString(),
    expires_at: snap.expires_at,
    used_at: prev?.used_at ?? null,
    type: snap.type,
    value: snap.value,
  };
  const out = [next, ...rest];
  await writeWallet(scope, customerId, out);
  return out;
}

export async function revokeCoupon(
  scope: { resolve: (k: any) => any },
  customerId: string,
  code: string,
): Promise<IssuedCoupon[]> {
  const upper = str(code, 64).toUpperCase();
  const out = (await readWallet(scope, customerId)).filter(c => c.code !== upper);
  await writeWallet(scope, customerId, out);
  return out;
}

// Stamp a coupon as spent. Called when an order is placed with that code, so
// the wallet stops advertising something the shopper has already used.
export async function markCouponsUsed(
  scope: { resolve: (k: any) => any },
  customerId: string,
  codes: string[],
): Promise<void> {
  const wanted = new Set(codes.map(c => str(c, 64).toUpperCase()).filter(Boolean));
  if (!wanted.size) return;
  const wallet = await readWallet(scope, customerId);
  let changed = false;
  const out = wallet.map(c => {
    if (!wanted.has(c.code) || c.used_at) return c;
    changed = true;
    return { ...c, used_at: new Date().toISOString() };
  });
  if (changed) await writeWallet(scope, customerId, out);
}

// Decide each coupon's state for display. Expiry is compared at end-of-day in
// the store's own terms: a code "valid until the 10th" must still work on the
// 10th, which a naive now > ends_at comparison gets wrong.
export async function walletWithState(
  scope: { resolve: (k: any) => any },
  customerId: string,
): Promise<WalletCoupon[]> {
  const wallet = await readWallet(scope, customerId);
  const snaps = await promotionSnapshots(scope, wallet.map(c => c.code));
  const now = Date.now();
  const out: WalletCoupon[] = [];
  for (const c of wallet) {
    const snap = snaps.get(c.code) || MISSING;
    const expiresAt = snap.found ? snap.expires_at ?? c.expires_at : c.expires_at;
    const expired = !!expiresAt && new Date(expiresAt).getTime() < now;
    const state: WalletCoupon["state"] = c.used_at
      ? "used"
      : expired
        ? "expired"
        : snap.found && !snap.active
          ? "inactive"
          : !snap.found
            ? "inactive"
            : "usable";
    out.push({
      ...c,
      // Prefer the live promotion so a changed discount is not misreported.
      type: snap.found ? snap.type : c.type,
      value: snap.found ? snap.value : c.value,
      expires_at: expiresAt,
      state,
    });
  }
  const rank = { usable: 0, used: 1, expired: 2, inactive: 3 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.issued_at.localeCompare(a.issued_at));
}
