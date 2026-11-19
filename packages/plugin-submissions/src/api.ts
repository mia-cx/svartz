import type { PreviewNote, PreviewOptions } from "@svartz/plugins/preview";

/** The plugin's id, and so its URL segment: `<base><mount>/_svartz/submissions/`. */
export const PLUGIN_ID = "submissions";

/** Largest Markdown source the server accepts, in UTF-8 bytes. */
export const MAX_MARKDOWN_BYTES = 512 * 1024;

/** Longest "what changed" note, in characters. */
export const MAX_NOTE_LENGTH = 2000;

/**
 * Where a save goes for the reader asking: `commit` straight to the branch, so it goes live with the next deploy, or
 * `pull-request`, for review. `null` when they can't save there as they are now, such as a guest who must sign in.
 */
export type Destination = "commit" | "pull-request" | null;

/** `GET <endpoint>/source/?page=<href>` answers this. */
export interface SourceResponse {
  readonly markdown: string;
  /** The source's git blob SHA, which an edit sends back as {@link EditRequest.sha}. */
  readonly sha: string;
  /** Where saving an edit of this page goes for this reader. */
  readonly destination: Destination;
}

/** `GET <endpoint>/destination/?folder=<folder>&title=<title>` answers this for a new page. */
export interface DestinationResponse {
  readonly destination: Destination;
}

/**
 * A published note a wikilink can name. The Split preview resolves links to it by `slug`, `path` and `aliases`, as
 * the build does, and links them to `href`.
 */
export interface LinkTarget extends PreviewNote {
  /**
   * What goes between `[[` and `]]`: the note's name, or its path inside the vault when another note shares the name,
   * without `.md`, as Obsidian writes it.
   */
  readonly link: string;
}

/**
 * `GET <endpoint>/links/` answers this: the published notes, never password-protected or hidden ones, and the
 * attachments the site publishes.
 */
export interface LinksResponse extends PreviewSettings {
  readonly notes: readonly LinkTarget[];
}

/** How the vault resolves and routes links, and the attachments they can name, for the Split preview. */
export type PreviewSettings = Pick<PreviewOptions, "linkResolution" | "mountPath" | "tagsRoute" | "attachments" | "sharedNames">;

/** A submission id: 32 lowercase hex digits, 128 random bits. */
export const SUBMISSION_ID_PATTERN = /^[0-9a-f]{32}$/;

/** `POST <endpoint>/edit/` takes this JSON body. */
export interface EditRequest {
  /**
   * Names this edit across retries, matching {@link SUBMISSION_ID_PATTERN}. The editor makes one per opened panel;
   * the server names the branch after it, so a retry finds the pull request an earlier attempt opened.
   */
  readonly submissionId: string;
  /** The note's URL path inside the deployment, such as `/guides/setup/`. */
  readonly page: string;
  readonly markdown: string;
  readonly note?: string;
  /**
   * The blob SHA of the source the edit was written against, from {@link SourceResponse.sha}. Required for a save that
   * commits: when the branch's file has another, the save opens a pull request instead.
   */
  readonly sha?: string;
  /** The Turnstile widget's token; required when the site configures `guard.turnstile`. */
  readonly turnstileToken?: string;
}

/** Longest new page title, in characters. */
export const MAX_TITLE_LENGTH = 120;

/** `POST <endpoint>/new/` takes this JSON body. The server derives the file path from `folder` and `title`. */
export interface NewPageRequest {
  /** As {@link EditRequest.submissionId}. */
  readonly submissionId: string;
  /** One of {@link BrowserOptions.folders}: a published folder's path inside the vault, `""` for its top level. */
  readonly folder: string;
  /** The page's title, which becomes its filename as in Obsidian: `Ada Lovelace` → `Ada Lovelace.md`. */
  readonly title: string;
  readonly markdown: string;
  readonly note?: string;
  readonly turnstileToken?: string;
}

/** `POST <endpoint>/edit/` and `POST <endpoint>/new/` answer 201 with this. */
export type EditResponse =
  /** The save opened pull request `number`. `reason: "changed"` when it was to commit, but the file changed since. */
  | { readonly kind: "pull-request"; readonly url: string; readonly number: number; readonly reason?: "changed" }
  /** The save committed `sha` to the branch; the site shows it once the next deploy finishes. */
  | { readonly kind: "commit"; readonly url: string; readonly sha: string };

/** Every failure answers with this JSON body; `message` is written for the reader. */
export interface ErrorResponse {
  readonly error: string;
  readonly message: string;
  /** On a 429: seconds until the reader may submit again. */
  readonly retryAfter?: number;
  /** On a 409 for a new page whose title is taken by a published page: that page's URL. */
  readonly existing?: string;
}

/** Settings the browser script receives. */
export interface BrowserOptions {
  /** The plugin's path below the deployment base: `<mount>/_svartz/submissions`. */
  readonly endpoint: string;
  /** URL paths (below the deployment base) of the notes readers can edit. */
  readonly pages: readonly string[];
  /** The vault folders a new page may go in: each holds a published note. `""` is the vault's top level. */
  readonly folders: readonly string[];
  /** The Turnstile site key, when the editor must show the widget. */
  readonly turnstileSiteKey?: string;
}
