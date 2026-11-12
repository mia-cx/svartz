/**
 * Unsent submissions, kept in `localStorage` per page so a closed tab or a sign-in round trip loses nothing, and a
 * crash at most the typing since the last autosave.
 * The panel saves what the reader writes as they write it, offers it back when it next opens on the same page, and
 * forgets it once the pull request is open or the reader discards it.
 */
import type { EditorTarget } from "./editor";

export type Draft = {
  readonly markdown: string;
  readonly note: string;
  /** When it was last saved, in milliseconds since the epoch. */
  readonly savedAt: number;
  /**
   * The page the reader left to sign in from, which sign-in returns them to. Back there, the panel reopens with the
   * draft at once instead of offering it.
   */
  readonly resume?: string;
} & (
  | { readonly kind: "edit"; readonly page: string }
  | { readonly kind: "new"; readonly folder: string; readonly title: string }
);

/**
 * Where `target`'s work is kept: by endpoint, so vaults on one site never share an entry, and by page, `new` for new
 * pages. The panel also keys unconfirmed submission ids by it.
 */
export const draftSlot = (endpoint: string, target: EditorTarget) => `${endpoint} ${target.kind === "edit" ? target.page : "new"}`;

const DRAFT_KEY = "svartz-submissions:draft:";

const isText = (value: unknown) => typeof value === "string";

/** The draft kept for `target`, if storage holds an intact one. */
export function readDraft(endpoint: string, target: EditorTarget): Draft | undefined {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY + draftSlot(endpoint, target)) ?? "null") as Partial<Record<string, unknown>> | null;
    if (!draft || draft.kind !== target.kind || !isText(draft.markdown) || !isText(draft.note) || typeof draft.savedAt !== "number") return undefined;
    if (draft.resume !== undefined && !isText(draft.resume)) return undefined;
    if (draft.kind === "edit" ? draft.page !== (target.kind === "edit" && target.page) : !isText(draft.folder) || !isText(draft.title)) return undefined;
    return draft as Draft;
  } catch {
    // Storage is blocked or holds something else under the key: there is no draft.
    return undefined;
  }
}

/** Keep `draft` for `target`, or forget the kept one. Answers whether storage took it. */
export function storeDraft(endpoint: string, target: EditorTarget, draft: Draft | undefined): boolean {
  const key = DRAFT_KEY + draftSlot(endpoint, target);
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
