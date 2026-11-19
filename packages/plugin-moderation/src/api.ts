/** What the server and the browser share: the plugin's id, what a report may hold, and the browser script's options. */

/** The plugin's id, and so its URL segment: `<base><mount>/_svartz/moderation/`. */
export const PLUGIN_ID = "moderation";

/** Characters in a report's reason, counted in UTF-16 code units as `maxlength` counts them. */
export const REASON_MAX_LENGTH = 1000;

/**
 * What a report can be about, and how each is named: a page by its slug, a commit by its full SHA, a submission by its
 * pull request number, an annotation by its id, and an account by its handle.
 */
export const TARGET_KINDS = ["page", "commit", "submission", "annotation", "account"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** `POST <endpoint>/reports/` takes this JSON body and answers 201 with `{ report: { id } }`. */
export interface ReportRequest {
  readonly target: { readonly kind: TargetKind; readonly id: string };
  readonly reason: string;
}

/** Settings the browser script receives. */
export interface BrowserOptions {
  /** The vault's mount path below the deployment base: its routes are `<mountPath>/_svartz/<plugin>/`. */
  readonly mountPath: string;
  /** Auth's folder of user pages, `users` by default: a page at `users/<handle>` also offers to report the account. */
  readonly userPages: string;
}
