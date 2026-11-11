/**
 * Adds Edit to the page actions of every editable note. The editor itself loads on first use.
 */
import type { BrowserScriptContext } from "@svartz/core";
import type { BrowserOptions } from "./api";

// Lucide "pencil", as the theme's other actions draw their icons.
const PENCIL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';

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
  const region = document.querySelector('[data-svartz-region="page-actions"]');
  const page = editablePage(pathname.slice(context.base.length), options.pages);
  if (!region || !page) return;

  let close: (() => void) | undefined;
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `${PENCIL_ICON}Edit`;
  button.addEventListener("click", async () => {
    const { openEditor } = await import("./editor");
    close = openEditor({ page, endpoint: `${context.base}${options.endpoint}`, opener: button });
  });
  region.append(button);

  return () => {
    close?.();
    button.remove();
  };
}
