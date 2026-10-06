import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { readNav } from "../../../../lib/nav";

// GET /store/cms/nav — the storefront's header/footer menu. Public, cached by
// the storefront under the "cms" tag and purged when the owner saves.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const items = (await readNav(req.scope)).filter((i) => i.enabled);
  res.json({ items });
}
