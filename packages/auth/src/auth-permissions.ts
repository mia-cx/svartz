/**
 * The permissions auth itself declares, for its People & permissions panel. Its server module registers them with the
 * catalogue as it starts, so they are always declared alike, on every vault.
 */
import type { PermissionDeclaration } from "@svartz/core";

/** Opens People & permissions: every account, role and grant, and why someone may do something. */
export const GRANTS_READ = "auth:grants:read";
/** Changes grants and roles, which makes whoever holds it as powerful as an admin. */
export const GRANTS_WRITE = "auth:grants:write";

/** Opens the Groups panel, which links groups to objects. Linking gives a group's owners everything there. */
export const GROUP_LINKS_WRITE = "auth:group-links:write";

/**
 * None has a default, so only admins hold them until someone is granted them, and each is administrative: owning a
 * page or a group's linked pages gives none of them.
 */
export const AUTH_PERMISSIONS: readonly PermissionDeclaration[] = [
  {
    slug: GRANTS_READ, name: "See people and permissions",
    description: "Open People & permissions: find accounts, see every role and grant, and check why someone may or may not do something.",
    administrative: true,
  },
  {
    slug: GRANTS_WRITE, name: "Change permissions and roles",
    description: "Grant, deny and unset permissions, create roles and choose who holds them. Whoever holds it can give themselves anything, as an admin can.",
    administrative: true,
  },
  {
    slug: GROUP_LINKS_WRITE, name: "Link groups to pages",
    description: "Link a group to a vault, folder or page, or unlink it. A group's owners may edit everything where it is linked.",
    administrative: true,
  },
];
