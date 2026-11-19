/**
 * The data behind People & permissions: accounts found by handle, stored roles and their members, stored grants, and the
 * changes to them. Every change runs in one batch with its audit entry, so neither lands without the other.
 */
import { auditStatement, type AuditEntry } from "./audit";
import { ADMIN_ROLE, heldRoles } from "./session";
import type { Grant, GrantValue } from "./permissions";
import type { Database } from "./store";

/** The longest role name, as long as a handle may be. */
export const ROLE_NAME_MAX_LENGTH = 39;
const ROLE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

/** A name a stored role may take: lowercase letters, digits and hyphens, never `admin`, which config alone grants. */
export const isRoleName = (name: string): boolean => ROLE_NAME.test(name) && name !== ADMIN_ROLE;

/** How many accounts a search shows. */
export const SEARCH_LIMIT = 20;

/** An account as the panel shows it. `id` stays on the server: forms name accounts by handle. */
export interface Person {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  /** `admin` first when config names one of its identities, then its stored roles. */
  readonly roles: readonly string[];
}

/** Who made a change, for its audit entry. */
type Actor = AuditEntry["actor"];

/** `rows` with their roles, in one batch whatever their number. */
async function withRoles(db: Database, rows: readonly { id: string; handle: string; name: string }[]): Promise<Person[]> {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map(({ id }) => id));
  const [identities, roles] = await db.batch([
    db.prepare("SELECT account_id, id FROM auth_identities WHERE account_id IN (SELECT value FROM json_each(?))").bind(ids),
    db.prepare("SELECT account_id, role FROM auth_role_members WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY role").bind(ids),
  ]);
  const of = (results: unknown[], key: "id" | "role", account: string) =>
    (results as Array<Record<string, string>>).filter((row) => row.account_id === account).map((row) => row[key]!);
  return rows.map(({ id, handle, name }) => ({
    id, handle, name, roles: heldRoles(of(identities!.results, "id", id), of(roles!.results, "role", id)),
  }));
}

/** The account that holds `handle`, or held it before, under its current handle. */
export async function personByHandle(db: Database, handle: string): Promise<Person | undefined> {
  const { results } = await db.prepare(`SELECT a.id, a.handle, a.name FROM auth_handles h JOIN auth_accounts a ON a.id = h.account_id
    WHERE h.handle = ?`).bind(handle).all<{ id: string; handle: string; name: string }>();
  return (await withRoles(db, results))[0];
}

/** Up to {@link SEARCH_LIMIT} accounts whose handle starts with `query` or whose display name contains it, by handle. */
export async function searchPeople(db: Database, query: string): Promise<Person[]> {
  const literal = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  const { results } = await db.prepare(`SELECT id, handle, name FROM auth_accounts
    WHERE handle LIKE ?1 ESCAPE '\\' OR name LIKE ?2 ESCAPE '\\' ORDER BY handle LIMIT ?3`)
    .bind(`${literal}%`, `%${literal}%`, SEARCH_LIMIT).all<{ id: string; handle: string; name: string }>();
  return withRoles(db, results);
}

/** A stored role and the accounts that hold it, each with whether reputation gave it to them. */
export interface Role {
  readonly name: string;
  readonly members: readonly { readonly handle: string; readonly name: string; readonly promoted: boolean }[];
}

/** Every stored role, by name, with its members by handle. */
export async function listRoles(db: Database): Promise<Role[]> {
  const [roles, members] = await db.batch([
    db.prepare("SELECT name FROM auth_roles ORDER BY name"),
    db.prepare(`SELECT m.role, a.handle, a.name, EXISTS (SELECT 1 FROM auth_reputation_promotions p
        WHERE p.account_id = m.account_id AND p.role = m.role) AS promoted
      FROM auth_role_members m JOIN auth_accounts a ON a.id = m.account_id ORDER BY a.handle`),
  ]);
  const rows = members!.results as Array<{ role: string; handle: string; name: string; promoted: number }>;
  return (roles!.results as Array<{ name: string }>).map(({ name }) => ({
    name,
    members: rows.filter((row) => row.role === name).map(({ handle, name: display, promoted }) => ({ handle, name: display, promoted: promoted === 1 })),
  }));
}

export async function roleExists(db: Database, name: string): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_roles WHERE name = ?").bind(name).all();
  return results.length > 0;
}

/** A stored grant as the panel lists it: an account actor by its handle, others by their id. */
export interface ListedGrant extends Grant {
  /** The account's handle, the role's name, or `guest` or `signed-in`. */
  readonly actor: string;
}

/** Every stored grant, by object, then permission, then actor. */
export async function listGrants(db: Database): Promise<ListedGrant[]> {
  const { results } = await db.prepare(`SELECT g.actor_type, g.actor_id, g.object, g.permission, g.value, a.handle
    FROM auth_grants g LEFT JOIN auth_accounts a ON g.actor_type = 'account' AND a.id = g.actor_id
    ORDER BY g.object, g.permission, g.actor_type, COALESCE(a.handle, g.actor_id)`)
    .all<{ actor_type: Grant["actorType"]; actor_id: string; object: string; permission: string; value: GrantValue; handle: string | null }>();
  return results.map((row) => ({
    actorType: row.actor_type, actorId: row.actor_id, object: row.object, permission: row.permission, value: row.value,
    actor: row.handle ?? row.actor_id,
  }));
}

/**
 * Set an account's, a role's or a group's grant of `permission` on `object`. `unset` removes it: only built-in actors
 * have defaults for a stored `unset` to override.
 */
export async function setGrant(db: Database, actor: Actor, grant: ListedGrant & { readonly actorType: "account" | "role" | "group" }): Promise<void> {
  const { actorType, actorId, object, permission, value } = grant;
  const change = value === "unset"
    ? db.prepare("DELETE FROM auth_grants WHERE permission = ? AND object = ? AND actor_type = ? AND actor_id = ?")
      .bind(permission, object, actorType, actorId)
    : db.prepare(`INSERT INTO auth_grants (actor_type, actor_id, object, permission, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (permission, object, actor_type, actor_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(actorType, actorId, object, permission, value, new Date().toISOString());
  await db.batch([change, auditStatement(db, {
    actor, action: "auth:grant:set", target: object, detail: { actorType, actor: grant.actor, permission, value },
  })]);
}

/** Create role `name`; `"exists"`, changing nothing, when there already is one. */
export async function createRole(db: Database, actor: Actor, name: string): Promise<"created" | "exists"> {
  try {
    await db.batch([
      db.prepare("INSERT INTO auth_roles (name, created_at) VALUES (?, ?)").bind(name, new Date().toISOString()),
      auditStatement(db, { actor, action: "auth:role:create", target: name }),
    ]);
    return "created";
  } catch (error) {
    if (await roleExists(db, name)) return "exists";
    throw error;
  }
}

/** Give `person` role `role`, which must exist. `false`, changing nothing, when they already hold it. */
export async function addMember(db: Database, actor: Actor, role: string, person: Pick<Person, "id" | "handle">): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_role_members WHERE role = ? AND account_id = ?").bind(role, person.id).all();
  if (results.length > 0) return false;
  await db.batch([
    db.prepare("INSERT INTO auth_role_members (role, account_id, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .bind(role, person.id, new Date().toISOString()),
    auditStatement(db, { actor, action: "auth:role:add-member", target: role, detail: { account: person.handle } }),
  ]);
  return true;
}

/** Take role `role` from `person`. `false`, changing nothing, when they don't hold it. */
export async function removeMember(db: Database, actor: Actor, role: string, person: Pick<Person, "id" | "handle">): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_role_members WHERE role = ? AND account_id = ?").bind(role, person.id).all();
  if (results.length === 0) return false;
  await db.batch([
    db.prepare("DELETE FROM auth_role_members WHERE role = ? AND account_id = ?").bind(role, person.id),
    auditStatement(db, { actor, action: "auth:role:remove-member", target: role, detail: { account: person.handle } }),
  ]);
  return true;
}
