/**
 * User pages: `<folder>/<handle>` in each vault, which the account holding or having held that handle may always edit.
 * The `auth` server module registers the folder, and the user pages its vault's build found, as it starts.
 *
 * A user page stays where it was written when its owner changes handle: the file lives in git under the old handle,
 * and old handles never pass to another account, so the page stays reachable at its address and stays its owner's.
 */

/** The folder of user pages unless the `auth` plugin's `userPages` names another. */
export const DEFAULT_USER_PAGE_FOLDER = "users";

let folder = DEFAULT_USER_PAGE_FOLDER;

/** The handles of every user page the vaults' builds found. */
const built = new Set<string>();

/**
 * Called by the `auth` server module as it starts, with the configured folder and the handles of the user pages its
 * vault's build found. Host vaults share accounts and agree on the folder; each brings its own pages.
 */
export function useUserPages(configured: string, handles: readonly string[]): void {
  folder = configured;
  for (const handle of handles) built.add(handle);
}

/** The folder that holds user pages, such as `users`. */
export const userPageFolder = (): string => folder;

/**
 * Whether a build found a user page for `handle`. Such a handle that no account holds is taken all the same: the account
 * choosing it would gain a page someone else wrote.
 */
export const hasUserPage = (handle: string): boolean => built.has(handle);
