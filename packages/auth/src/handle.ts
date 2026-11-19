/**
 * Handles: the unique name an account goes by across the site, and the slug of its `users/<handle>` page. So a
 * handle is lowercase letters, digits, hyphens and underscores, starts and ends with a letter or digit, and fits
 * GitHub's longest login.
 *
 * A handle also names its user page's address exactly, so it avoids every spelling the route builder rewrites in a
 * file name (`@svartz/plugins`' `fileToSlug` and `routeSlug`): a run of hyphens collapses into one (`a--b` would be
 * `a-b`'s page), a trailing `_index` loses its underscore (`ada_index` would be `adaindex`'s), and `index` is its
 * folder's own page. Submissions' tests check the rule against those helpers.
 */

export const HANDLE_MAX_LENGTH = 39;
const HANDLE = new RegExp(`^(?!.*--)(?!index$)(?!.*_index$)[a-z0-9](?:[a-z0-9_-]{0,${HANDLE_MAX_LENGTH - 2}}[a-z0-9])?$`);
/** What a handle falls back to when nothing about the reader makes one. */
const FALLBACK_HANDLE = "reader";

export const isHandle = (value: string): boolean => HANDLE.test(value);

/** What a reader sees when the handle they typed breaks the rules. */
export const HANDLE_PROBLEM = `Use up to ${HANDLE_MAX_LENGTH} lowercase letters, numbers, single hyphens and underscores, starting and ending with a letter or number, other than "index" or a name ending in "_index".`;

/** What the reader typed, as the handle it would become: trimmed, lowercase, without a leading `@`. */
export const typedHandle = (input: string): string => input.trim().replace(/^@/, "").toLowerCase();

/**
 * The closest handle to `name`: a provider's username or a display name. Accents are dropped, anything else outside the
 * handle alphabet becomes a hyphen, and the result is trimmed to fit. `reader` when nothing is left, and the `-2`
 * variant when what is left names another page than its own, such as `index`.
 */
export function handleFrom(name: string | undefined): string {
  const handle = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .slice(0, HANDLE_MAX_LENGTH)
    .replace(/^[-_]+|[-_]+$/g, "");
  if (!handle) return FALLBACK_HANDLE;
  return isHandle(handle) ? handle : numbered(handle, 2);
}

/** `base` with the suffix `-<n>`, shortened so the whole still fits. */
export function numbered(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${base.slice(0, HANDLE_MAX_LENGTH - suffix.length).replace(/[-_]+$/, "")}${suffix}`;
}
