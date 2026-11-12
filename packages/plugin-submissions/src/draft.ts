/**
 * A submission a signed-out reader was writing, kept in `sessionStorage` while they sign in. Signing in leaves the
 * page; when the reader comes back to it, the panel reopens with the draft as it was.
 */
export type Draft = {
  /** The plugin's endpoint, deployment base included, so vaults on one site never share a draft. */
  readonly endpoint: string;
  /** The page the reader signed in from, which sign-in returns them to. */
  readonly pathname: string;
  readonly markdown: string;
  readonly note: string;
} & (
  | { readonly kind: "edit"; readonly page: string }
  | { readonly kind: "new"; readonly folder: string; readonly title: string }
);

const DRAFT_KEY = "svartz-submissions:draft";

const isText = (value: unknown) => typeof value === "string";

/**
 * The draft saved for `endpoint` on `pathname`. It stays saved until the panel restores it, so a panel that fails to
 * load can offer it again.
 */
export function readDraft(endpoint: string, pathname: string): Draft | undefined {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Record<string, unknown>> | null;
    if (draft?.endpoint !== endpoint || draft.pathname !== pathname) return undefined;
    if (!isText(draft.markdown) || !isText(draft.note)) return undefined;
    if (draft.kind === "edit" ? !isText(draft.page) : draft.kind !== "new" || !isText(draft.folder) || !isText(draft.title)) return undefined;
    return draft as Draft;
  } catch {
    // Storage is blocked or holds something else under the key: there is no draft to resume.
    return undefined;
  }
}

/** Save `draft`, or forget the saved one. Answers whether storage took it. */
export function storeDraft(draft: Draft | undefined): boolean {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
