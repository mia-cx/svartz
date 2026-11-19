/**
 * Who may do what, where: grants, the objects they sit on, and {@link resolve}, the pure function every `can()` ends in.
 *
 * A grant is `(actor, object, permission) → allow | deny | unset`. Objects run from a page through its folders and
 * vault to the site, and the most specific one with a grant that applies decides. Within it, the most specific actor
 * decides: an account, then its groups, then its roles, then `signed-in`, then `guest`. Deny wins between equals.
 */
import { isHandle } from "./handle";
import { ADMIN_ROLE } from "./session";
import type { UserPageLocation } from "./user-pages";

export type GrantValue = "allow" | "deny" | "unset";

export type ActorType = "account" | "group" | "role" | "static";

/** The built-in actors: `guest` is everyone, signed in or not; `signed-in` is everyone with an account. */
export const STATIC_ACTORS = ["guest", "signed-in"] as const;
export type StaticActor = (typeof STATIC_ACTORS)[number];

/** The object every chain ends in. */
export const SITE = "site";

/** One grant, stored or declared. */
export interface Grant {
  readonly actorType: ActorType;
  readonly actorId: string;
  /** `site`, `vault:<id>`, `folder:<vault>/<path>/`, `page:<vault>/<slug>` or `group:<id>`. */
  readonly object: string;
  readonly permission: string;
  readonly value: GrantValue;
}

/** What a check is about: the whole site (`{}`), a vault, or a page of one, by its slug. */
export type PermissionTarget =
  | { readonly vault?: undefined; readonly page?: undefined }
  | { readonly vault: string; readonly page?: string };

/** A group the asker belongs to. */
export interface Membership {
  readonly group: string;
  readonly owner: boolean;
  /** The objects a moderator linked the group to; its owners hold every permission on them and below. */
  readonly linked: readonly string[];
}

/** Who is asking. Without `account` they are a guest. */
export interface Principals {
  readonly account?: {
    readonly id: string;
    readonly handle: string;
    /** Handles the account held before. They never pass to another account, so their user pages stay its own. */
    readonly formerHandles?: readonly string[];
  };
  readonly roles: readonly string[];
  readonly groups: readonly Membership[];
}

/** Why a {@link Decision} came out as it did. */
export type DecidedBy =
  /** The asker holds the `admin` role, which is allowed everything. */
  | { readonly kind: "admin" }
  /** The asker's own user page, `<userPages>/<handle>`. */
  | { readonly kind: "user-page"; readonly object: string }
  /** The asker owns a group linked to `object`, which is this object or encloses it. */
  | { readonly kind: "group-owner"; readonly group: string; readonly object: string }
  | { readonly kind: "grant"; readonly grant: Grant }
  /** No grant applies: the answer is `unset`, which `can()` treats as no. */
  | { readonly kind: "nothing" };

export interface Decision {
  readonly value: GrantValue;
  readonly decidedBy: DecidedBy;
}

/** The objects a check on `target` consults, most specific first, always ending in {@link SITE}. */
export function objectChain(target: PermissionTarget): string[] {
  if (target.vault === undefined) return [SITE];
  const { vault } = target;
  const segments = (target.page ?? "").split("/").filter(Boolean);
  if (segments.length === 0) return [`vault:${vault}`, SITE];
  const folders = segments.slice(0, -1).map((_, index) => `folder:${vault}/${segments.slice(0, index + 1).join("/")}/`);
  return [`page:${vault}/${segments.join("/")}`, ...folders.reverse(), `vault:${vault}`, SITE];
}

/** How specific a grant's actor is for `who`, lower first; `undefined` when it isn't them. */
function rank(grant: Grant, who: Principals): number | undefined {
  switch (grant.actorType) {
    case "account": return who.account && grant.actorId === who.account.id ? 0 : undefined;
    case "group": return who.groups.some(({ group }) => group === grant.actorId) ? 1 : undefined;
    case "role": return who.roles.includes(grant.actorId) ? 2 : undefined;
    case "static":
      if (grant.actorId === "signed-in") return who.account ? 3 : undefined;
      return grant.actorId === "guest" ? 4 : undefined;
  }
}

/**
 * The handle whose user page `object` is, `<folder>/<handle>` in the vault `at` names, or `undefined`. Only the page
 * itself: a page below it, in another vault, or named by a handle in another case or one that breaks the handle rules
 * is nobody's user page.
 */
export function userPageHandle(object: string | undefined, { vault, folder }: UserPageLocation): string | undefined {
  if (vault === undefined) return undefined;
  const prefix = `page:${vault}/${folder}/`;
  if (!object?.startsWith(prefix)) return undefined;
  const handle = object.slice(prefix.length);
  return isHandle(handle) ? handle : undefined;
}

/**
 * Decide `permission` on the object `chain` describes (from {@link objectChain}) for `who`, from `grants` already loaded.
 * User pages are `<folder>/<handle>` in the vault `userPages` names.
 *
 * 1. The `admin` role is allowed everything.
 * 2. Owner overrides allow: an account on its own user page, under its current handle or one it held before, and a
 *    group's owners on any object linked to the group, or enclosed by one. They cover what is done to a page's
 *    content, never an `administrative` permission, which only the `admin` role or a grant gives.
 * 3. Otherwise the first object in the chain with a set grant that applies to `who` decides. Within it, the first actor
 *    tier with such a grant decides (account, group, role, `signed-in`, `guest`), and a deny beats an allow in a tier.
 * 4. With nothing set, the answer is `unset`.
 */
export function resolve(
  grants: readonly Grant[],
  who: Principals,
  chain: readonly string[],
  permission: string,
  userPages: UserPageLocation,
  administrative = false,
): Decision {
  if (who.roles.includes(ADMIN_ROLE)) return { value: "allow", decidedBy: { kind: "admin" } };
  // Owning a page is about its content. A permission that administers the site comes only from a grant.
  if (!administrative) {
    const owner = userPageHandle(chain[0], userPages);
    if (owner !== undefined && who.account && (owner === who.account.handle || who.account.formerHandles?.includes(owner))) {
      return { value: "allow", decidedBy: { kind: "user-page", object: chain[0]! } };
    }
    for (const object of chain) {
      const owned = who.groups.find(({ owner, linked }) => owner && linked.includes(object));
      if (owned) return { value: "allow", decidedBy: { kind: "group-owner", group: owned.group, object } };
    }
  }

  for (const object of chain) {
    const applying = grants.flatMap((grant) => {
      if (grant.object !== object || grant.permission !== permission || grant.value === "unset") return [];
      const tier = rank(grant, who);
      return tier === undefined ? [] : [{ grant, tier }];
    });
    if (applying.length === 0) continue;
    const tier = Math.min(...applying.map(({ tier }) => tier));
    const peers = applying.filter((candidate) => candidate.tier === tier);
    const { grant } = peers.find(({ grant }) => grant.value === "deny") ?? peers[0]!;
    return { value: grant.value, decidedBy: { kind: "grant", grant } };
  }
  return { value: "unset", decidedBy: { kind: "nothing" } };
}
