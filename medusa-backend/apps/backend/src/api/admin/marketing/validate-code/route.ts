import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

// POST /admin/marketing/validate-code  { code, subtotal }
// Resolves a discount code for the POS: returns the computed discount for the
// given subtotal so the cashier sees the same number the storefront would apply.
// Only active, order-level codes are honoured; anything else is rejected with a
// reason the cashier can read.
const CURRENCY = "mnt";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  const code = String(body.code || "").trim();
  const subtotal = Math.max(0, Math.round(Number(body.subtotal) || 0));
  if (!code) {
    res.status(400).json({ ok: false, message: "Код оруулна уу." });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "promotion",
    fields: [
      "id", "code", "status", "is_automatic",
      "application_method.type", "application_method.value",
      "application_method.currency_code", "application_method.target_type",
      "campaign.ends_at", "campaign.starts_at",
    ],
    filters: { code } as any,
    pagination: { take: 1, skip: 0 },
  });

  const promo = (data || [])[0] as any;
  if (!promo) {
    res.status(404).json({ ok: false, message: "Ийм код олдсонгүй." });
    return;
  }
  if (promo.status && promo.status !== "active") {
    res.status(400).json({ ok: false, message: "Энэ код идэвхгүй байна." });
    return;
  }
  const now = Date.now();
  const startsAt = promo.campaign?.starts_at ? new Date(promo.campaign.starts_at).getTime() : null;
  const endsAt = promo.campaign?.ends_at ? new Date(promo.campaign.ends_at).getTime() : null;
  if (startsAt && now < startsAt) {
    res.status(400).json({ ok: false, message: "Энэ кодын хугацаа эхлээгүй байна." });
    return;
  }
  if (endsAt && now > endsAt) {
    res.status(400).json({ ok: false, message: "Энэ кодын хугацаа дууссан байна." });
    return;
  }

  const am = promo.application_method || {};
  const type = String(am.type || "");
  const value = Number(am.value ?? 0);
  if (!type || !Number.isFinite(value) || value <= 0) {
    res.status(400).json({ ok: false, message: "Кодын тохиргоо дутуу байна." });
    return;
  }
  if (am.currency_code && String(am.currency_code).toLowerCase() !== CURRENCY) {
    res.status(400).json({ ok: false, message: "Энэ код өөр валютад зориулагдсан." });
    return;
  }

  // percentage → % of the ticket; fixed → a flat amount. Never exceeds the ticket.
  const raw = type === "percentage" ? Math.round((subtotal * Math.min(100, value)) / 100) : Math.round(value);
  const discount = Math.max(0, Math.min(subtotal, raw));

  res.json({ ok: true, code: promo.code, type, value, discount });
}
