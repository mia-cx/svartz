/**
 * Groups, such as a wiki's alliances: actors that hold grants, with owners and members. Any account creates one and owns
 * it; owners invite accounts, which join only by accepting, remove members and make co-owners. A group always keeps at
 * least one owner. A moderator links a group to objects, which gives its owners every permission there and below.
 *
 * Every change runs in one batch with its audit entry. Each guards itself in SQL, the asker's ownership included, so a
 * change that raced another lands whole or not at all, and only a change that landed is audited.
 */
import { auditIfChanged, auditStatement, type AuditEntry } from "./audit";
import { isHandle } from "./handle";
import { STATIC_ACTORS, type Membership } from "./permissions";
import { ADMIN_ROLE } from "./session";
import type { Database, Statement } from "./store";

/** Who made a change, for its audit entry: the signed-in account. */
type Actor = AuditEntry["actor"];
/** An account a change concerns, by its id and current handle. */
type Person = { readonly id: string; readonly handle: string };

/** Names that read as a built-in actor or the admin role wherever a grant names its group. */
const RESERVED = new Set<string>([ADMIN_ROLE, ...STATIC_ACTORS]);

/** A name a group may take: a handle, as `handle.ts` rules it, other than `admin`, `guest` and `signed-in`. */
export const isGroupName = (name: string): boolean => isHandle(name) && !RESERVED.has(name);

export interface Group {
  /** Unique and never changed: grants and links name the group by it. */
  readonly name: string;
  readonly displayName: string;
}

export interface GroupMember {
  readonly handle: string;
  readonly name: string;
  readonly owner: boolean;
}

/** Everything a group's own page shows its members. */
export interface GroupDetail extends Group {
  /** Owners first, then by handle. */
  readonly members: readonly GroupMember[];
  /** Accounts invited and not yet answered, by handle. */
  readonly invitations: readonly { readonly handle: string; readonly name: string }[];
  /** The objects a moderator linked the group to. */
  readonly links: readonly string[];
}

/** A group as the moderators' Groups panel lists it: who owns it and where it is linked. */
export interface ListedGroup extends Group {
  readonly owners: readonly string[];
  readonly links: readonly string[];
}

/** One step of a change: the statements that make it, guarded, and the audit entry that records it if it landed. */
async function change(db: Database, statements: readonly Statement[], entry: AuditEntry): Promise<boolean> {
  const answers = await db.batch([...statements, auditIfChanged(db, entry)]);
  return answers.at(-1)!.results.length > 0;
}

/** SQL that holds when `?2`, the asker, owns group `?1`. */
const ASKER_OWNS = "EXISTS (SELECT 1 FROM auth_group_members WHERE group_name = ?1 AND account_id = ?2 AND owner = 1)";

/** The groups `account` belongs to, whether it owns each, and each group's links: who it is to the resolver. */
export async function membershipsOf(db: Database, account: string): Promise<Membership[]> {
  const { results } = await db.prepare(`SELECT m.group_name, m.owner, l.object FROM auth_group_members m
      LEFT JOIN auth_group_links l ON l.group_name = m.group_name WHERE m.account_id = ?`)
    .bind(account).all<{ group_name: string; owner: number; object: string | null }>();
  const groups = new Map<string, { group: string; owner: boolean; linked: string[] }>();
  for (const { group_name, owner, object } of results) {
    const membership = groups.get(group_name) ?? { group: group_name, owner: owner === 1, linked: [] };
    if (object !== null) membership.linked.push(object);
    groups.set(group_name, membership);
  }
  return [...groups.values()];
}

/** Whether `account` owns group `name`, is a member, or neither. */
export async function standing(db: Database, name: string, account: string): Promise<"owner" | "member" | undefined> {
  const { results: [row] } = await db.prepare("SELECT owner FROM auth_group_members WHERE group_name = ? AND account_id = ?")
    .bind(name, account).all<{ owner: number }>();
  return row === undefined ? undefined : row.owner === 1 ? "owner" : "member";
}

export async function groupExists(db: Database, name: string): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_groups WHERE name = ?").bind(name).all();
  return results.length > 0;
}

/** The groups `account` belongs to, by display name, and the invitations waiting for it, with who sent each. */
export async function groupsOf(db: Database, account: string): Promise<{
  groups: Array<Group & { owner: boolean }>;
  invitations: Array<Group & { invitedBy: string }>;
}> {
  const [groups, invitations] = await db.batch([
    db.prepare(`SELECT g.name, g.display_name, m.owner FROM auth_group_members m JOIN auth_groups g ON g.name = m.group_name
      WHERE m.account_id = ? ORDER BY g.display_name, g.name`).bind(account),
    db.prepare(`SELECT g.name, g.display_name, a.handle FROM auth_group_invitations i JOIN auth_groups g ON g.name = i.group_name
      JOIN auth_accounts a ON a.id = i.invited_by WHERE i.account_id = ? ORDER BY i.invited_at, g.name`).bind(account),
  ]);
  return {
    groups: (groups!.results as Array<{ name: string; display_name: string; owner: number }>)
      .map(({ name, display_name, owner }) => ({ name, displayName: display_name, owner: owner === 1 })),
    invitations: (invitations!.results as Array<{ name: string; display_name: string; handle: string }>)
      .map(({ name, display_name, handle }) => ({ name, displayName: display_name, invitedBy: handle })),
  };
}

/** Group `name` with its members, open invitations and links; `undefined` when there is none. */
export async function groupDetail(db: Database, name: string): Promise<GroupDetail | undefined> {
  const [groups, members, invitations, links] = await db.batch([
    db.prepare("SELECT name, display_name FROM auth_groups WHERE name = ?").bind(name),
    db.prepare(`SELECT a.handle, a.name, m.owner FROM auth_group_members m JOIN auth_accounts a ON a.id = m.account_id
      WHERE m.group_name = ? ORDER BY m.owner DESC, a.handle`).bind(name),
    db.prepare(`SELECT a.handle, a.name FROM auth_group_invitations i JOIN auth_accounts a ON a.id = i.account_id
      WHERE i.group_name = ? ORDER BY a.handle`).bind(name),
    db.prepare("SELECT object FROM auth_group_links WHERE group_name = ? ORDER BY object").bind(name),
  ]);
  const group = groups!.results[0] as { name: string; display_name: string } | undefined;
  if (!group) return undefined;
  return {
    name: group.name,
    displayName: group.display_name,
    members: (members!.results as Array<{ handle: string; name: string; owner: number }>)
      .map(({ handle, name: display, owner }) => ({ handle, name: display, owner: owner === 1 })),
    invitations: invitations!.results as Array<{ handle: string; name: string }>,
    links: (links!.results as Array<{ object: string }>).map(({ object }) => object),
  };
}

/** Every group, by name, with its owners' handles and its links. */
export async function listGroups(db: Database): Promise<ListedGroup[]> {
  const [groups, owners, links] = await db.batch([
    db.prepare("SELECT name, display_name FROM auth_groups ORDER BY name"),
    db.prepare(`SELECT m.group_name, a.handle FROM auth_group_members m JOIN auth_accounts a ON a.id = m.account_id
      WHERE m.owner = 1 ORDER BY a.handle`),
    db.prepare("SELECT group_name, object FROM auth_group_links ORDER BY object"),
  ]);
  const of = (rows: unknown[], group: string, key: "handle" | "object") =>
    (rows as Array<Record<string, string>>).filter((row) => row.group_name === group).map((row) => row[key]!);
  return (groups!.results as Array<{ name: string; display_name: string }>).map(({ name, display_name }) => ({
    name, displayName: display_name, owners: of(owners!.results, name, "handle"), links: of(links!.results, name, "object"),
  }));
}

/** Create group `name`, owned by `actor`; `"taken"`, changing nothing, when there already is one. */
export async function createGroup(db: Database, actor: Actor, { name, displayName }: Group): Promise<"created" | "taken"> {
  const at = new Date().toISOString();
  try {
    await db.batch([
      db.prepare("INSERT INTO auth_groups (name, display_name, created_at) VALUES (?, ?, ?)").bind(name, displayName, at),
      db.prepare("INSERT INTO auth_group_members (group_name, account_id, owner, added_at) VALUES (?, ?, 1, ?)").bind(name, actor.id, at),
      auditStatement(db, { actor, action: "auth:group:create", target: name, detail: { displayName } }),
    ]);
    return "created";
  } catch (error) {
    if (await groupExists(db, name)) return "taken";
    throw error;
  }
}

/** Invite `person` to group `name`, when `actor` owns it and `person` is neither a member nor invited already. */
export function invite(db: Database, actor: Actor, name: string, person: Person): Promise<boolean> {
  return change(db, [
    db.prepare(`INSERT INTO auth_group_invitations (group_name, account_id, invited_by, invited_at)
        SELECT ?1, ?3, ?2, ?4 WHERE ${ASKER_OWNS}
          AND NOT EXISTS (SELECT 1 FROM auth_group_members WHERE group_name = ?1 AND account_id = ?3)
        ON CONFLICT DO NOTHING`).bind(name, actor.id, person.id, new Date().toISOString()),
  ], { actor, action: "auth:group:invite", target: name, detail: { account: person.handle } });
}

/** Withdraw `person`'s invitation to group `name`: an owner withdraws anyone's, and the invited account declines its own. */
export function uninvite(db: Database, actor: Actor, name: string, person: Person): Promise<boolean> {
  return change(db, [
    db.prepare(`DELETE FROM auth_group_invitations WHERE group_name = ?1 AND account_id = ?3 AND (?3 = ?2 OR ${ASKER_OWNS})`)
      .bind(name, actor.id, person.id),
  ], { actor, action: "auth:group:uninvite", target: name, detail: { account: person.handle } });
}

/** Accept `actor`'s own invitation to group `name`, joining it as a member. `false` when no invitation waits. */
export function accept(db: Database, actor: Actor, name: string): Promise<boolean> {
  return change(db, [
    db.prepare(`INSERT INTO auth_group_members (group_name, account_id, owner, added_at)
        SELECT ?1, ?2, 0, ?3 WHERE EXISTS (SELECT 1 FROM auth_group_invitations WHERE group_name = ?1 AND account_id = ?2)
        ON CONFLICT DO NOTHING`).bind(name, actor.id, new Date().toISOString()),
    db.prepare("DELETE FROM auth_group_invitations WHERE group_name = ? AND account_id = ?").bind(name, actor.id),
  ], { actor, action: "auth:group:accept", target: name });
}

/**
 * Take `person` out of group `name`: an owner removes anyone, and a member leaves. Never the group's last owner, so a
 * group always has one. `false`, changing nothing, otherwise.
 */
export function removeFromGroup(db: Database, actor: Actor, name: string, person: Person): Promise<boolean> {
  return change(db, [
    db.prepare(`DELETE FROM auth_group_members WHERE group_name = ?1 AND account_id = ?3 AND (?3 = ?2 OR ${ASKER_OWNS})
        AND (owner = 0 OR (SELECT COUNT(*) FROM auth_group_members WHERE group_name = ?1 AND owner = 1) > 1)`)
      .bind(name, actor.id, person.id),
  ], { actor, action: "auth:group:remove", target: name, detail: { account: person.handle } });
}

/** Make member `person` a co-owner of group `name`, when `actor` owns it. */
export function promote(db: Database, actor: Actor, name: string, person: Person): Promise<boolean> {
  return change(db, [
    db.prepare(`UPDATE auth_group_members SET owner = 1 WHERE group_name = ?1 AND account_id = ?3 AND owner = 0 AND ${ASKER_OWNS}`)
      .bind(name, actor.id, person.id),
  ], { actor, action: "auth:group:promote", target: name, detail: { account: person.handle } });
}

/** Link group `name` to `object`, as a moderator does. `false` when it is linked there already. */
export function link(db: Database, actor: Actor, name: string, object: string): Promise<boolean> {
  return change(db, [
    db.prepare(`INSERT INTO auth_group_links (group_name, object, linked_at) SELECT ?1, ?2, ?3
        WHERE EXISTS (SELECT 1 FROM auth_groups WHERE name = ?1) ON CONFLICT DO NOTHING`).bind(name, object, new Date().toISOString()),
  ], { actor, action: "auth:group:link", target: object, detail: { group: name } });
}

/** Unlink group `name` from `object`. `false` when it wasn't linked there. */
export function unlink(db: Database, actor: Actor, name: string, object: string): Promise<boolean> {
  return change(db, [
    db.prepare("DELETE FROM auth_group_links WHERE group_name = ? AND object = ?").bind(name, object),
  ], { actor, action: "auth:group:unlink", target: object, detail: { group: name } });
}
