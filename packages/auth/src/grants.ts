/**
 * Checking permissions at runtime: {@link can} loads the grants that could apply in one query and hands them, with the
 * declared defaults, to the pure resolver. {@link migrateGrants} moves a plugin's config list onto grants, once.
 */
import type { PermissionDeclaration, PermissionSlug } from "@svartz/core";
import { objectChain, resolve, SITE, type Grant, type GrantValue, type PermissionTarget, type Principals } from "./permissions";
import type { Account } from "./session";
import { accountsDatabase, type Database } from "./store";

type Env = Readonly<Record<string, unknown>>;

/**
 * The deployed site's permission catalogue, by slug. The `auth` plugin is eager, so its server module registers it
 * before the site answers any request; code that checks permissions outside a Svartz site's handle finds it empty.
 */
let catalogue = new Map<string, PermissionDeclaration>();

/** Called by the `auth` server module as it starts, with the catalogue collected at build time. */
export function usePermissions(declarations: readonly PermissionDeclaration[]): void {
  catalogue = new Map(declarations.map((declaration) => [declaration.slug, declaration]));
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

/** Every stored grant of `permission` on `chain`'s objects, in one query whatever the chain's length. */
async function loadGrants(db: Database, permission: string, chain: readonly string[]): Promise<Grant[]> {
  const { results } = await db.prepare(`SELECT actor_type, actor_id, object, value FROM auth_grants
      WHERE permission = ?1 AND object IN (SELECT value FROM json_each(?2))`)
    .bind(permission, JSON.stringify(chain)).all<GrantRow>();
  return results.map((row) => ({ actorType: row.actor_type, actorId: row.actor_id, object: row.object, permission, value: row.value }));
}

/** `stored`, plus each declared default no stored grant to the same actor on the site replaces. */
function withDefaults(stored: readonly Grant[], { slug, defaults = {} }: PermissionDeclaration): Grant[] {
  const replaced = (actor: string) => stored.some((grant) => grant.actorType === "static" && grant.actorId === actor && grant.object === SITE);
  const declaredGrants = Object.entries(defaults).filter(([actor]) => !replaced(actor))
    .map(([actor, value]): Grant => ({ actorType: "static", actorId: actor, object: SITE, permission: slug, value }));
  return [...stored, ...declaredGrants];
}

/** Who `account` is to the resolver. Groups and stored roles arrive with their own tables. */
const principalsOf = (account: Account | null): Principals => account
  ? { account: { id: account.id, handle: account.handle }, roles: account.roles, groups: [] }
  : { roles: [], groups: [] };

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
  const grants = withDefaults(await loadGrants(db, permission, chain), declaration);
  return resolve(grants, principalsOf(account), chain, permission).value === "allow";
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
