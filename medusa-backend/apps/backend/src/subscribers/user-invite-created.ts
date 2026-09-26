import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { sendInviteEmail } from "../lib/email";
import { pendingInviteRole } from "../lib/invite-roles";
import { ROLES } from "../lib/rbac";

// A staff invite was created (admin → Баг ба эрх → Ажилтан урих). Medusa mints
// the token; we turn it into an email with the accept link and the token as a
// copyable code, so the invitee can finish on any device and set their OWN
// password (we never see it).
export default async function inviteCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const userModule = container.resolve(Modules.USER);
  const [invite]: any[] = await userModule.listInvites({ id: data.id }, { take: 1 });
  if (!invite?.email || !invite?.token) return;
  if (invite.accepted) return;

  // Public URL of the admin (where /app/invite lives).
  const base = (process.env.ADMIN_URL || process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
  const url = `${base}/app/invite?token=${encodeURIComponent(invite.token)}`;

  const role = await pendingInviteRole(container as any, invite.email);
  const roleLabel = role ? ROLES.find(r => r.value === role)?.label : undefined;

  await sendInviteEmail({ email: invite.email, url, code: invite.token, roleLabel });
}

export const config: SubscriberConfig = {
  event: "user.invite.created",
};
