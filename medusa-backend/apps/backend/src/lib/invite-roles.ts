import { Modules } from "@medusajs/framework/utils";
import { setStoreMeta } from "./store-meta";

// A Medusa invite carries no RBAC role, and the role only becomes settable once
// the invitee accepts and a user row exists. So we park the intended role here
// (store.metadata.naran_invite_roles, keyed by lowercased email) when the invite
// is sent, and a `user.user.created` subscriber applies it the moment they join.
// The entry is removed once used, so this map only ever holds open invites.

const KEY = "naran_invite_roles";

type Scope = { resolve: (k: any) => any };
type RoleMap = Record<string, string>;

async function readMap(scope: Scope): Promise<RoleMap> {
  const storeModule = scope.resolve(Modules.STORE);
  const [store] = await storeModule.listStores({}, { take: 1, select: ["id", "metadata"] as any });
  const m = (store?.metadata as any)?.[KEY];
  return m && typeof m === "object" ? { ...(m as RoleMap) } : {};
}

export async function setInviteRole(scope: Scope, email: string, role: string): Promise<void> {
  const map = await readMap(scope);
  map[email.trim().toLowerCase()] = role;
  await setStoreMeta(scope, KEY, map);
}

export async function pendingInviteRole(scope: Scope, email: string): Promise<string | null> {
  const map = await readMap(scope);
  return map[email.trim().toLowerCase()] || null;
}

export async function clearInviteRole(scope: Scope, email: string): Promise<void> {
  const map = await readMap(scope);
  const k = email.trim().toLowerCase();
  if (!(k in map)) return;
  delete map[k];
  await setStoreMeta(scope, KEY, map);
}
