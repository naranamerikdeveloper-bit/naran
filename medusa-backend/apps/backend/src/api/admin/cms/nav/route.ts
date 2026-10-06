import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { readNav, writeNav, sanitizeNav } from "../../../../lib/nav";
import { audit } from "../../../../lib/audit";
import { revalidateStorefront } from "../../../../lib/revalidate-storefront";

// GET  /admin/cms/nav — the current menu (the four built-ins until first save).
// POST /admin/cms/nav — replace it. Both guarded by content.write.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ items: await readNav(req.scope) });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const items = sanitizeNav((req.body as any)?.items ?? req.body);
  await writeNav(req.scope, items);
  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "cms.nav.save",
    target: "nav",
    meta: { items: items.length },
  }, Date.now());
  const live = await revalidateStorefront(["cms"]);
  res.json({ items, live });
}
