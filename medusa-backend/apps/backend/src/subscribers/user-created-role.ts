import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { clearInviteRole, pendingInviteRole } from "../lib/invite-roles";
import { isRole } from "../lib/rbac";

// An invited member just accepted and set their password, so the user row now
// exists — apply the role the inviter picked (parked in lib/invite-roles) and
// drop the pending entry. Without this a new member would land role-less, which
// the RBAC layer treats as super_admin unless SUPER_ADMIN_EMAILS is configured.
export default async function userCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const userModule = container.resolve(Modules.USER);
  const [user]: any[] = await userModule.listUsers({ id: data.id }, { take: 1, select: ["id", "email", "metadata"] as any });
  if (!user?.email) return;
  if (user.metadata?.role) return; // already assigned — don't override

  const role = await pendingInviteRole(container as any, user.email);
  if (!role || !isRole(role)) return;

  await userModule.updateUsers({
    id: user.id,
    metadata: { ...(user.metadata || {}), role },
  } as any);
  await clearInviteRole(container as any, user.email);
  console.log(`[invite] ${user.email} joined with role ${role}`);
}

export const config: SubscriberConfig = {
  event: "user.user.created",
};
