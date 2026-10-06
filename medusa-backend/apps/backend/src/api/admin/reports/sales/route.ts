import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { salesReport } from "../../../../lib/reports";

// GET /admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&staff=<user_id>
// Sales report: totals (incl. VAT breakdown), daily trend, by category, by
// product, and the per-cashier till breakdown. `staff` narrows everything
// except that breakdown to one cashier. Guarded by reports.read.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;
  const staff = (req.query.staff as string) || undefined;
  res.json(await salesReport(req.scope, from, to, staff));
}
