/**
 * Adds Edit to the page actions of every editable note, and New page to the site actions of every page. The editor
 * itself loads on first use, or at once when the reader comes back from signing in with a draft for this page.
 */
import type { BrowserScriptContext } from "@svartz/core";
import type { BrowserOptions } from "./api";
import { takeDraft, type Draft } from "./draft";
import type { EditorTarget } from "./editor";

// Lucide "pencil" and "file-plus", as the theme's other actions draw their icons.
const PENCIL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
const FILE_PLUS_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/></svg>';

/** The index's route for `path`, which a URL may percent-encode: `/caf%C3%A9/` is `/café/`. */
function editablePage(path: string, pages: readonly string[]): string | undefined {
  if (pages.includes(path)) return path;
  try {
    const decoded = decodeURI(path);
    return pages.includes(decoded) ? decoded : undefined;
  } catch {
    // A malformed escape names no note.
    return undefined;
  }
}

export function mount(pathname: string, options: BrowserOptions, context: BrowserScriptContext = { base: "" }) {
  const endpoint = `${context.base}${options.endpoint}`;
  const buttons: HTMLButtonElement[] = [];
  let close: (() => void) | undefined;
  let unmounted = false;

  /** A button in `region` that opens the editor on `target`. Answers how to open it with a draft. */
  function action(region: Element | null, icon: string, label: string, target: EditorTarget) {
    if (!region) return undefined;
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `${icon}${label}`;
    const open = async (draft?: Draft) => {
      const { openEditor } = await import("./editor");
      // The page may have gone while the editor loaded; its panel would outlive the cleanup below.
      if (unmounted) return;
      close = openEditor({ target, endpoint, opener: button, turnstileSiteKey: options.turnstileSiteKey, draft });
    };
    button.addEventListener("click", () => open());
    region.append(button);
    buttons.push(button);
    return open;
  }

  const page = editablePage(pathname.slice(context.base.length), options.pages);
  const edit = page ? action(document.querySelector('[data-svartz-region="page-actions"]'), PENCIL_ICON, "Edit", { kind: "edit", page }) : undefined;
  const create = options.folders.length > 0
    ? action(document.querySelector('[data-svartz-region="site-actions"]'), FILE_PLUS_ICON, "New page", { kind: "new", folders: options.folders })
    : undefined;
  if (buttons.length === 0) return;

  // Back from signing in: the panel the reader left reopens with their draft.
  const draft = takeDraft(endpoint, pathname);
  if (draft?.kind === "edit" && draft.page === page) void edit?.(draft);
  if (draft?.kind === "new") void create?.(draft);

  return () => {
    unmounted = true;
    close?.();
    for (const button of buttons) button.remove();
  };
}
