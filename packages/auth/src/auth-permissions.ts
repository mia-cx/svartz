/**
 * The permissions auth itself declares, for its People & permissions panel. Its server module registers them with the
 * catalogue as it starts, so they are always declared alike, on every vault.
 */
import type { PermissionDeclaration } from "@svartz/core";

/** Opens People & permissions: every account, role and grant, and why someone may do something. */
export const GRANTS_READ = "auth:grants:read";
/** Changes grants and roles, which makes whoever holds it as powerful as an admin. */
export const GRANTS_WRITE = "auth:grants:write";

/** Gives other accounts kudos, which add to their reputation. */
export const KUDOS_WRITE = "auth:kudos:write";

/** None has a default, so only admins hold them until someone is granted them. */
export const AUTH_PERMISSIONS: readonly PermissionDeclaration[] = [
  {
    slug: GRANTS_READ, name: "See people and permissions",
    description: "Open People & permissions: find accounts, see every role and grant, and check why someone may or may not do something.",
  },
  {
    slug: GRANTS_WRITE, name: "Change permissions and roles",
    description: "Grant, deny and unset permissions, create roles and choose who holds them. Whoever holds it can give themselves anything, as an admin can.",
  },
  {
    slug: KUDOS_WRITE, name: "Give kudos",
    description: "Give another account kudos, with a reason, which adds to their reputation. Each account gets at most one a day from each moderator.",
  },
];
