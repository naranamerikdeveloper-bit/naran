import { defineRouteConfig } from "@medusajs/admin-sdk";
import { UsersSolid } from "@medusajs/icons";
import { Container, Heading, Text, Table, Badge, Select, Button, Input, Label, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ROLES, Role } from "../../../lib/rbac";
import { usePermissions } from "../../lib/perms";
import { PageHeader, Panel } from "../../lib/ui";

type AdminUser = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  metadata?: { role?: Role } | null;
};

type Invite = { id: string; email: string; accepted?: boolean; expires_at?: string | null };

const ROLE_LABEL = new Map(ROLES.map((r) => [r.value, r.label]));

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/admin${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.message || `Request failed (${res.status})`);
  }
  return res;
}

const TeamPage = () => {
  const { loading: permLoading, can } = usePermissions();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Invites
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("cashier");
  const [inviting, setInviting] = useState(false);

  const loadInvites = async () => {
    try {
      const res = await adminFetch("/invites?limit=100");
      setInvites((await res.json()).invites || []);
    } catch { /* invites are optional — never block the page */ }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Имэйл буруу байна"); return; }
    setInviting(true);
    try {
      // Park the role first, so the invite email can name it and the new user
      // gets it automatically the moment they accept.
      await adminFetch("/team/invite-role", { method: "POST", body: JSON.stringify({ email, role: inviteRole }) });
      await adminFetch("/invites", { method: "POST", body: JSON.stringify({ email }) });
      toast.success(`${email} рүү урилга илгээлээ`);
      setInviteEmail("");
      await loadInvites();
    } catch (e: any) {
      toast.error(e.message || "Урилга илгээхэд алдаа гарлаа");
    } finally {
      setInviting(false);
    }
  };

  const resendInvite = async (inv: Invite) => {
    try {
      await adminFetch(`/invites/${inv.id}/resend`, { method: "POST" });
      toast.success(`${inv.email} рүү дахин илгээлээ`);
    } catch (e: any) {
      toast.error(e.message || "Дахин илгээж чадсангүй");
    }
  };

  const revokeInvite = async (inv: Invite) => {
    if (!confirm(`${inv.email} рүү илгээсэн урилгыг цуцлах уу?`)) return;
    try {
      await adminFetch(`/invites/${inv.id}`, { method: "DELETE" });
      toast.success("Урилга цуцлагдлаа");
      await loadInvites();
    } catch (e: any) {
      toast.error(e.message || "Цуцалж чадсангүй");
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/users?limit=200");
      setUsers((await res.json()).users || []);
    } catch (e: any) {
      toast.error(e.message || "Хэрэглэгч ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); loadInvites(); }, []);

  const assign = async (id: string, role: Role) => {
    setSaving(id);
    try {
      await adminFetch(`/users/${id}/role`, { method: "POST", body: JSON.stringify({ role }) });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, metadata: { ...(u.metadata || {}), role } } : u)));
      toast.success(`Эрх шинэчлэгдлээ: ${ROLE_LABEL.get(role)}`);
    } catch (e: any) {
      toast.error(e.message || "Эрх онооход алдаа гарлаа");
    } finally {
      setSaving(null);
    }
  };

  if (!permLoading && !can("team.manage")) {
    return (
      <Container className="p-6">
        <Heading level="h1">Баг ба эрх</Heading>
        <Text className="text-ui-fg-subtle mt-2">Энэ хэсгийг үзэх эрх танд байхгүй байна (team.manage шаардлагатай).</Text>
      </Container>
    );
  }

  const name = (u: AdminUser) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";

  return (
    <Container className="divide-y p-0">
      <PageHeader
        title="Баг ба эрх"
        description="Ажилтнуудад дүр (role) оноож, админ хэсгийн эрхийг хязгаарлана. Дүргүй хэрэглэгч түр зуур бүх эрхтэй (Super Admin) гэж тооцогдоно."
      />

      {/* Invite a new member */}
      <Panel title="Ажилтан урих" bodyClassName="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label size="small">Имэйл</Label>
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="ajiltan@naranamerikbaraa.mn" className="w-[280px]"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendInvite(); } }} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small">Эрх</Label>
            <div className="w-[220px]">
              <Select size="small" value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                <Select.Trigger><Select.Value /></Select.Trigger>
                <Select.Content>
                  {ROLES.map((r) => <Select.Item key={r.value} value={r.value}>{r.label}</Select.Item>)}
                </Select.Content>
              </Select>
            </div>
          </div>
          <Button variant="primary" onClick={sendInvite} isLoading={inviting} disabled={!inviteEmail.trim()}>
            Урилга илгээх
          </Button>
        </div>
        <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
          Урилгын имэйл дээр холбоос болон код очно. Ажилтан түүгээр орж <b>өөрийн нууц үгээ</b> тохируулмагц
          сонгосон эрх автоматаар онооно.
        </Text>

        {invites.filter(i => !i.accepted).length > 0 && (
          <div className="mt-4 overflow-hidden rounded-lg border border-ui-border-base">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Хүлээгдэж буй урилга</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {invites.filter(i => !i.accepted).map((inv) => (
                  <Table.Row key={inv.id}>
                    <Table.Cell>{inv.email}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="small" onClick={() => resendInvite(inv)}>Дахин илгээх</Button>
                        <Button variant="danger" size="small" onClick={() => revokeInvite(inv)}>Цуцлах</Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Panel>

      <Panel>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Хэрэглэгч</Table.HeaderCell>
              <Table.HeaderCell>Имэйл</Table.HeaderCell>
              <Table.HeaderCell>Одоогийн дүр</Table.HeaderCell>
              <Table.HeaderCell>Дүр өөрчлөх</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row><Table.Cell {...({ colSpan: 4 } as any)}><Text className="text-ui-fg-subtle py-4">Ачаалж байна…</Text></Table.Cell></Table.Row>
            ) : (
              users.map((u) => {
                const current = u.metadata?.role;
                return (
                  <Table.Row key={u.id}>
                    <Table.Cell>{name(u)}</Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle">{u.email}</Table.Cell>
                    <Table.Cell>
                      {current ? (
                        <Badge size="2xsmall" color={current === "super_admin" ? "purple" : "grey"}>{ROLE_LABEL.get(current) || current}</Badge>
                      ) : (
                        <Badge size="2xsmall" color="orange">Super Admin (default)</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="w-[220px]">
                        <Select
                          size="small"
                          value={current || ""}
                          onValueChange={(v) => assign(u.id, v as Role)}
                          disabled={saving === u.id}
                        >
                          <Select.Trigger>
                            <Select.Value placeholder="Дүр сонгох…" />
                          </Select.Trigger>
                          <Select.Content>
                            {ROLES.map((r) => (
                              <Select.Item key={r.value} value={r.value}>{r.label}</Select.Item>
                            ))}
                          </Select.Content>
                        </Select>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
      </Panel>

      {/* Role reference */}
      <div className="px-6 py-4">
        <Text weight="plus" size="small" className="mb-2">Дүрүүдийн тайлбар</Text>
        <div className="flex flex-col gap-2">
          {ROLES.map((r) => (
            <div key={r.value} className="flex items-start gap-3">
              <Badge size="2xsmall" color={r.value === "super_admin" ? "purple" : "grey"} className="mt-0.5 shrink-0">{r.label}</Badge>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {r.permissions[0] === "*" ? "Бүх эрх" : (r.permissions as string[]).join(", ")}
              </Text>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Баг ба эрх",
  icon: UsersSolid,
});

export default TeamPage;
