import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { isRole } from "../../../../lib/rbac";
import { setInviteRole } from "../../../../lib/invite-roles";
import { audit } from "../../../../lib/audit";

// POST /admin/team/invite-role  { email, role }
// Records the role an invitee should get. A Medusa invite can't carry our RBAC
// role, and the role is only settable once they accept, so we park it here and
// the `user.user.created` subscriber applies it automatically on join.
// Guarded by team.manage (see src/api/middlewares.ts).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as any) || {};
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Имэйл буруу байна" });
    return;
  }
  if (!isRole(role)) {
    res.status(400).json({ message: "Эрх буруу байна" });
    return;
  }

  await setInviteRole(req.scope, email, role);
  await audit(req.scope, {
    actor_id: (req as any).auth_context?.actor_id || null,
    action: "team.invite",
    target: email,
    meta: { role },
  }, Date.now());

  res.json({ ok: true, email, role });
}
