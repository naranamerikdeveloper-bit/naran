import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { isRole } from "../../../../../lib/rbac";
import { audit } from "../../../../../lib/audit";

// POST /admin/users/:id/role  { role }
// Assign an RBAC role to an admin user (stored on user.metadata.role).
// Guarded by the "team.manage" permission (see src/api/middlewares.ts).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const role = (req.body as any)?.role;
  if (!isRole(role)) {
    res.status(400).json({ message: "Invalid role" });
    return;
  }
  const userModule = req.scope.resolve(Modules.USER);
  // Guard against lock-out: nobody changes their own role, and the last
  // super_admin can't be demoted.
  if (id === (req as any).auth_context?.actor_id) {
    res.status(400).json({ message: "Өөрийн эрхийг өөрчлөх боломжгүй" });
    return;
  }
  const existing: any = await userModule.retrieveUser(id, { select: ["id", "metadata"] as any });
  if (existing?.metadata?.role === "super_admin" && role !== "super_admin") {
    const all: any[] = await userModule.listUsers({}, { select: ["id", "metadata"] as any, take: 1000 });
    if (all.filter(u => u?.metadata?.role === "super_admin").length <= 1) {
      res.status(400).json({ message: "Сүүлчийн super_admin-ий эрхийг бууруулах боломжгүй" });
      return;
    }
  }
  const updated = await userModule.updateUsers({
    id,
    metadata: { ...(existing?.metadata || {}), role },
  } as any);
  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "role.assign",
    target: id,
    meta: { role },
  }, Date.now());
  res.json({ id, role, user: updated });
}
