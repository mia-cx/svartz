import type { CommitSource } from "@svartz/plugin-submissions/commits";
import type { RouteClaims } from "@svartz/plugin-submissions/restore";
import type { PreviewNote, PreviewOptions } from "@svartz/plugins/preview";

/** The plugin's id: its server answers under `<mount>/_svartz/history/`. */
export const PLUGIN_ID = "history";

/** The page names it claims: `/-/history/<page>`, `/-/changes/` and `/-/contributions/<handle>/`. */
export const PAGES = ["history", "changes", "contributions"] as const;

/** What the build hands the server module: never sent to the browser. */
export interface HistoryData {
  /** Where the vault's commits are read from: the submissions plugin's mirror and credentials. */
  readonly source: CommitSource;
  /** The routes every page holds, hidden ones included, which a reverted page's frontmatter may claim. */
  readonly claims: RouteClaims;
  /** The published notes, never protected or hidden ones. Links resolve to them; those in Markdown have a history. */
  readonly notes: readonly PreviewNote[];
  /** How the vault resolves links, and the attachments it publishes, to render revisions as the build would. */
  readonly preview: Pick<PreviewOptions, "linkResolution" | "mountPath" | "tagsRoute" | "attachments" | "sharedNames">;
}

/** What the browser script receives: where history pages are, and which pages have one. */
export interface BrowserOptions {
  /** The vault's mount path, `""` at the site's root. */
  readonly mountPath: string;
  /** The routes below the deployment base of every page with a history, such as `/wiki/guides/setup/`. */
  readonly pages: readonly string[];
  /**
   * The folder of user pages below the deployment base, such as `/wiki/users/`, when this vault holds them: their
   * pages get the account's contributions below the note.
   */
  readonly userPages?: string;
}
