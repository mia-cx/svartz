/**
 * Handles: the unique name an account goes by across the site, and later the slug of its `users/<handle>` page. So a
 * handle is lowercase letters, digits, hyphens and underscores, starts and ends with a letter or digit, and fits
 * GitHub's longest login.
 */

export const HANDLE_MAX_LENGTH = 39;
const HANDLE = new RegExp(`^[a-z0-9](?:[a-z0-9_-]{0,${HANDLE_MAX_LENGTH - 2}}[a-z0-9])?$`);
/** What a handle falls back to when nothing about the reader makes one. */
const FALLBACK_HANDLE = "reader";

export const isHandle = (value: string): boolean => HANDLE.test(value);

/** What the reader typed, as the handle it would become: trimmed, lowercase, without a leading `@`. */
export const typedHandle = (input: string): string => input.trim().replace(/^@/, "").toLowerCase();

/**
 * The closest handle to `name`: a provider's username or a display name. Accents are dropped, anything else outside the
 * handle alphabet becomes a hyphen, and the result is trimmed to fit. `reader` when nothing is left.
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
  return handle || FALLBACK_HANDLE;
}

/** `base` with the suffix `-<n>`, shortened so the whole still fits. */
export function numbered(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${base.slice(0, HANDLE_MAX_LENGTH - suffix.length).replace(/[-_]+$/, "")}${suffix}`;
}
