import type { PermissionDeclaration } from "@svartz/core";

/** Revert a page to an earlier revision. */
export const REVERT = "history:reverts:write";

/**
 * What the plugin declares to `auth`. Reverting is administrative: only the admin role or a grant gives it, never
 * owning a user page or a group's pages, and nobody holds it by default.
 */
export const PERMISSIONS = [
  {
    slug: REVERT,
    name: "Revert pages",
    description: "Make a page read as it did at an earlier revision, taking back the reputation the changes since earned.",
    administrative: true,
  },
] as const satisfies readonly PermissionDeclaration[];
