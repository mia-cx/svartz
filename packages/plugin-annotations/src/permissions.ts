import type { PermissionDeclaration } from "@svartz/core";

/** Post comments on a page's passages. Every signed-in reader may, unless a grant says otherwise. */
export const WRITE_COMMENTS = "annotations:comments:write";
/** Delete anyone's annotation on a page, not only one's own: what the deprecated `moderators` option gave. */
export const DELETE_COMMENTS = "annotations:comments:delete";

/** What the plugin declares to `auth`, which collects it at build time and checks it with `can()`. */
export const PERMISSIONS = [
  {
    slug: WRITE_COMMENTS,
    name: "Comment",
    description: "Post comments on the passages of a page.",
    defaults: { "signed-in": "allow" },
  },
  {
    slug: DELETE_COMMENTS,
    name: "Delete any comment",
    description: "Delete anyone's comments and reactions on a page, not only one's own.",
  },
] as const satisfies readonly PermissionDeclaration[];
