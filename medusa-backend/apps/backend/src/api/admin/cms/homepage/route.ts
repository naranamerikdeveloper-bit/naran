import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { readHomepage, writeHomepage, sanitize } from "../../../../lib/cms";
import { audit } from "../../../../lib/audit";
import { revalidateStorefront } from "../../../../lib/revalidate-storefront";

// GET  /admin/cms/homepage — current editable homepage content.
// POST /admin/cms/homepage — save it. Both guarded by content.write.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ content: await readHomepage(req.scope) });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const content = sanitize((req.body as any)?.content ?? req.body);
  await writeHomepage(req.scope, content);
  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "cms.save",
    target: "homepage",
    meta: { hero: content.hero.length, promo: content.promo.enabled },
  }, Date.now());
  // Push it live now rather than waiting for the storefront's ISR window.
  const live = await revalidateStorefront(["cms"]);
  res.json({ content, live });
}
