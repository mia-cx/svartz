/**
 * User pages: `<folder>/<handle>` in the vault that runs sign-in, which the account holding or having held that handle
 * may always edit. That is the vault itself for a standalone vault, and the callback vault in a host app, which every
 * host vault agrees on; a page at the same path in any other vault is an ordinary page.
 *
 * Every `auth` server module registers where user pages live as it starts. Only the user page vault's module brings
 * the pages its build found, so nothing here merges what several vaults' builds say.
 *
 * A user page stays where it was written when its owner changes handle: the file lives in git under the old handle,
 * and old handles never pass to another account, so the page stays reachable at its address and stays its owner's.
 */

/** The folder of user pages unless the `auth` plugin's `userPages` names another. */
export const DEFAULT_USER_PAGE_FOLDER = "users";

/** Where user pages live: a folder of one vault. Without a `vault`, no page is a user page. */
export interface UserPageLocation {
  readonly vault?: string;
  readonly folder: string;
}

/** The user pages a build found, by handle, mapped to their URL below the deployment base; `null` for a hidden page. */
export type UserPages = Readonly<Record<string, string | null>>;

let location: UserPageLocation = { folder: DEFAULT_USER_PAGE_FOLDER };
let built: UserPages | undefined;

/**
 * Called by every `auth` server module as it starts, with where user pages live. The user page vault's module also
 * passes `pages`, what its build found.
 */
export function useUserPages(at: UserPageLocation, pages?: UserPages): void {
  location = at;
  if (pages) built = pages;
}

/** Where user pages live, such as `{ vault: "notes", folder: "users" }`. */
export const userPageLocation = (): UserPageLocation => location;

/**
 * The user pages the user page vault's build found, or `undefined` until that vault's `auth` module has started: in a
 * host app, a request another vault answers may come first.
 */
export const builtUserPages = (): UserPages | undefined => built;

/** Whether `pages` holds a user page for `handle`; own keys only, so `constructor` is no page. */
export const hasUserPage = (pages: UserPages, handle: string): boolean => Object.hasOwn(pages, handle);

/**
 * Whether a new account may take `handle` as far as user pages go: no page holds it, and it isn't the user page
 * folder's own name, since `users/users.md` is the `users` folder's own note rather than a user page.
 */
export const userPageFree = (pages: UserPages, handle: string): boolean =>
  !hasUserPage(pages, handle) && handle !== location.folder.split("/").pop();
