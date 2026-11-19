import type { PermissionDeclaration } from "@svartz/core";

/** Send an edit or a new page for review, as a pull request. */
export const OPEN_PULL_REQUESTS = "submissions:pull-requests:write";
/** Save an edit or a new page straight to the repository, without review. */
export const COMMIT = "submissions:commits:write";
/** Comment on, review, merge and close submissions. Replies and follow-up edits on anyone's submission check it. */
export const REVIEW = "submissions:reviews:write";
/** See other people's submissions and edits on the dashboard: it opens the Recent edits panel. */
export const READ_PULL_REQUESTS = "submissions:pull-requests:read";
/**
 * Follow your own submissions: the My submissions panel, replies on them and follow-up edits. Declared only with
 * `sync`, which the panel reads.
 */
export const FOLLOW_OWN = "submissions:own-submissions:read";

/**
 * What the plugin declares to `auth`. Signed-in readers may open pull requests by default, and guests too where
 * Turnstile checks them (`guestsChecked`); the rest goes to admins and whoever they grant it. With `synced`, every
 * signed-in reader may also follow their own submissions; guests have none to follow.
 */
export function permissions(guestsChecked: boolean, synced = false) {
  return [
    {
      slug: OPEN_PULL_REQUESTS,
      name: "Suggest edits",
      description: "Send an edit or a new page for review, as a pull request.",
      defaults: guestsChecked ? { guest: "allow", "signed-in": "allow" } : { "signed-in": "allow" },
    },
    {
      slug: COMMIT,
      name: "Edit directly",
      description: "Save an edit or a new page straight to the repository, without review.",
    },
    {
      slug: REVIEW,
      name: "Review submissions",
      description: "Comment on, review, merge and close submissions.",
    },
    {
      slug: READ_PULL_REQUESTS,
      name: "See submissions",
      description: "See other people's open and recent submissions.",
    },
    ...synced
      ? [{
        slug: FOLLOW_OWN,
        name: "Follow own submissions",
        description: "See your own submissions on the dashboard, reply to their reviews and add follow-up edits.",
        defaults: { "signed-in": "allow" },
      }] as const
      : [],
  ] as const satisfies readonly PermissionDeclaration[];
}
