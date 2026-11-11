/** The plugin's id, and so its URL segment: `<base><mount>/_svartz/submissions/`. */
export const PLUGIN_ID = "submissions";

/** Largest Markdown source the server accepts, in UTF-8 bytes. */
export const MAX_MARKDOWN_BYTES = 512 * 1024;

/** Longest "what changed" note, in characters. */
export const MAX_NOTE_LENGTH = 2000;

/** `GET <endpoint>/source/?page=<href>` answers this. */
export interface SourceResponse {
  readonly markdown: string;
}

/** `POST <endpoint>/edit/` takes this JSON body. */
export interface EditRequest {
  /** The note's URL path inside the deployment, such as `/guides/setup/`. */
  readonly page: string;
  readonly markdown: string;
  readonly note?: string;
  /** The Turnstile widget's token; required when the site configures `guard.turnstile`. */
  readonly turnstileToken?: string;
}

/** `POST <endpoint>/edit/` answers 201 with this. */
export interface EditResponse {
  readonly url: string;
  readonly number: number;
}

/** Every failure answers with this JSON body; `message` is written for the reader. */
export interface ErrorResponse {
  readonly error: string;
  readonly message: string;
  /** On a 429: seconds until the reader may submit again. */
  readonly retryAfter?: number;
}

/** Settings the browser script receives. */
export interface BrowserOptions {
  /** The plugin's path below the deployment base: `<mount>/_svartz/submissions`. */
  readonly endpoint: string;
  /** URL paths (below the deployment base) of the notes readers can edit. */
  readonly pages: readonly string[];
  /** The Turnstile site key, when the editor must show the widget. */
  readonly turnstileSiteKey?: string;
}
