/**
 * Checking permissions at runtime: {@link can} loads the grants that could apply and who is asking in one D1 call, and
 * hands them, with the declared defaults, to the pure resolver. {@link migrateGrants} moves a plugin's config list onto grants, once.
 */
import type { PermissionDeclaration, PermissionSlug } from "@svartz/core";
import {
  objectChain, resolve, SITE, userPageHandle, type Decision, type Grant, type GrantValue, type PermissionTarget, type Principals,
} from "./permissions";
import { memberships, membershipsQuery, type MembershipRow } from "./groups";
import type { Account } from "./session";
import { accountsDatabase, handlesOf, type Database } from "./store";
import { userPageLocation } from "./user-pages";

type Env = Readonly<Record<string, unknown>>;

/**
 * The deployed site's permission catalogue, by slug. The `auth` plugin is eager, so its server module registers it
 * before the site answers any request; code that checks permissions outside a Svartz site's handle finds it empty.
 */
const catalogue = new Map<string, PermissionDeclaration>();

/**
 * Called by the `auth` server module as it starts, with the permissions collected at build time. It adds to the
 * catalogue: in a host app each vault's `auth` starts on its own, and brings what only its vault's build knew.
 */
export function usePermissions(declarations: readonly PermissionDeclaration[]): void {
  for (const declaration of declarations) catalogue.set(declaration.slug, declaration);
}

/** `permission`'s declaration; a permission nobody declared is a bug in the plugin checking it, so it throws. */
function declared(permission: string): PermissionDeclaration {
  const declaration = catalogue.get(permission);
  if (declaration) return declaration;
  throw new Error(`[svartz:auth] "${permission}" isn't a declared permission. Declare it in the plugin's permissions, `
    + "and run svartzHandle in the app's hooks so auth starts before anything checks one.");
}

interface GrantRow {
  actor_type: Grant["actorType"];
  actor_id: string;
  object: string;
  value: GrantValue;
}

/**
 * What a check reads, in one D1 call however long the chain: every stored grant of `permission` on `chain`'s objects,
 * and who `account` is to the resolver. That is itself, its roles (config's `admin` and stored ones) and its groups,
 * read on every check, so a removed member loses the group's grants on their next request. Its former handles cost a
 * second call, made only when `chain` checks a user page under another handle than its current one, the one case they
 * can decide.
 */
async function load(
  db: Database, account: Pick<Account, "id" | "handle" | "roles"> | null, permission: string, chain: readonly string[],
): Promise<[stored: Grant[], who: Principals]> {
  const grants = db.prepare(`SELECT actor_type, actor_id, object, value FROM auth_grants
      WHERE permission = ?1 AND object IN (SELECT value FROM json_each(?2))`).bind(permission, JSON.stringify(chain));
  const [granted, joined] = await db.batch(account ? [grants, membershipsQuery(db, account.id)] : [grants]);
  const stored = (granted!.results as GrantRow[])
    .map((row): Grant => ({ actorType: row.actor_type, actorId: row.actor_id, object: row.object, permission, value: row.value }));
  if (!account) return [stored, { roles: [], groups: [] }];
  const owner = userPageHandle(chain[0], userPageLocation());
  const formerHandles = owner !== undefined && owner !== account.handle ? await handlesOf(db, account.id) : [];
  const groups = memberships(joined!.results as MembershipRow[]);
  return [stored, { account: { id: account.id, handle: account.handle, formerHandles }, roles: account.roles, groups }];
}

/** `stored`, plus each declared default no stored grant to the same actor on the site replaces. */
function withDefaults(stored: readonly Grant[], { slug, defaults = {} }: PermissionDeclaration): Grant[] {
  const replaced = (actor: string) => stored.some((grant) => grant.actorType === "static" && grant.actorId === actor && grant.object === SITE);
  const declaredGrants = Object.entries(defaults).filter(([actor]) => !replaced(actor))
    .map(([actor, value]): Grant => ({ actorType: "static", actorId: actor, object: SITE, permission: slug, value }));
  return [...stored, ...declaredGrants];
}

/** Every permission the site's plugins declare, in the order they registered. */
export const permissionCatalogue = (): PermissionDeclaration[] => [...catalogue.values()];

/** Whether a plugin on the site declares `permission`. */
export const isDeclared = (permission: string): permission is PermissionSlug => catalogue.has(permission);

/** A {@link Decision}, and whether a permission's declared default made it rather than a stored grant. */
export interface Explanation extends Decision {
  readonly byDefault: boolean;
}

/**
 * Why `account` may or may not do `permission` on the objects of `chain` (most specific first, ending in the site), as
 * `can()` decides it. For the dashboard's "can they?" check.
 */
export async function explain(db: Database, account: Pick<Account, "id" | "handle" | "roles">, permission: PermissionSlug, chain: readonly string[]): Promise<Explanation> {
  const declaration = declared(permission);
  const [stored, who] = await load(db, account, permission, chain);
  const decision = resolve(withDefaults(stored, declaration), who, chain, permission, userPageLocation(), declaration.administrative);
  const { decidedBy } = decision;
  return { ...decision, byDefault: decidedBy.kind === "grant" && !stored.includes(decidedBy.grant) };
}

/**
 * Whether `account` may do `permission` on the grant object `object` itself (`site`, `vault:<id>`, a folder or a
 * page), given as the objects a check on it consults. For changes that land on an object the form names: the right to
 * make them is checked where they land, not on the vault the form was sent from.
 */
export async function mayOn(db: Database, account: Pick<Account, "id" | "handle" | "roles">, permission: PermissionSlug, chain: readonly string[]): Promise<boolean> {
  return (await explain(db, account, permission, chain)).value === "allow";
}

/**
 * Whether `account` (`null` for a guest) may do `permission` on `target`: the site (`{}`), a vault (`{ vault }`), or a
 * page of one (`{ vault, page }`, by the page's slug). Grants on the page, its folders, its vault and the site apply,
 * the most specific first; see `resolve` in `permissions.ts` for the order.
 *
 * Fails closed: without `SVARTZ_DB` there are no grants, so it answers `false`, and a failed load throws. A permission
 * the site's plugins don't declare throws too.
 */
export async function can(account: Account | null, permission: PermissionSlug, target: PermissionTarget, env: Env): Promise<boolean> {
  const declaration = declared(permission);
  const db = await accountsDatabase(env);
  if (!db) return false;
  const chain = objectChain(target);
  const [stored, who] = await load(db, account, permission, chain);
  return resolve(withDefaults(stored, declaration), who, chain, permission, userPageLocation(), declaration.administrative).value === "allow";
}

/** A grant a plugin's config gives an identity, such as a moderator it lists, to move onto that identity's account. */
export interface IdentityGrant {
  /** The identity id, such as `"github:583231"`. */
  readonly identity: string;
  readonly permission: PermissionSlug;
  readonly target: PermissionTarget;
  readonly value: "allow" | "deny";
}

/**
 * Give each identity's account its grant, once ever: the first call that finds the identity linked to an account stores
 * the grant, unless that account already holds one for the same permission and object, and records that it did. Later
 * calls change nothing, so a grant an admin changed or removed since stays that way. Answers, per grant, whether it
 * is in place: `false` for an identity with no account yet, which a later call can still move once they sign in, and
 * for every grant when the site binds no `SVARTZ_DB`.
 */
export async function migrateGrants(env: Env, grants: readonly IdentityGrant[]): Promise<boolean[]> {
  for (const { permission } of grants) declared(permission);
  const db = await accountsDatabase(env);
  if (!db || grants.length === 0) return grants.map(() => false);
  const at = new Date().toISOString();
  const moves = grants.map(({ identity, permission, target, value }) => ({ identity, permission, value, object: objectChain(target)[0]! }));
  // One batch is one transaction, so racing calls apply each grant at most once between them.
  const answers = await db.batch([
    ...moves.flatMap(({ identity, permission, value, object }) => [
      db.prepare(`INSERT INTO auth_grants (actor_type, actor_id, object, permission, value, updated_at)
          SELECT 'account', account_id, ?2, ?3, ?4, ?5 FROM auth_identities
          WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM auth_grant_migrations WHERE identity_id = ?1 AND object = ?2 AND permission = ?3)
          ON CONFLICT DO NOTHING`).bind(identity, object, permission, value, at),
      db.prepare(`INSERT INTO auth_grant_migrations (identity_id, object, permission, migrated_at)
          SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM auth_identities WHERE id = ?1)
          ON CONFLICT DO NOTHING`).bind(identity, object, permission, at),
    ]),
    db.prepare(`SELECT identity_id, object, permission FROM auth_grant_migrations
        WHERE identity_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(moves.map(({ identity }) => identity))),
  ]);
  const done = new Set((answers.at(-1)!.results as Array<{ identity_id: string; object: string; permission: string }>)
    .map((row) => JSON.stringify([row.identity_id, row.object, row.permission])));
  return moves.map(({ identity, object, permission }) => done.has(JSON.stringify([identity, object, permission])));
}
