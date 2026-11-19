/** Adds History to the page actions of every page with a history, beside Copy page and Edit. */
import type { BrowserScriptContext } from "@svartz/core";
import type { BrowserOptions } from "./api";

// Lucide "history", as the theme's other actions draw their icons.
const HISTORY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>';

/** The index's route for `path`, which a URL may percent-encode: `/caf%C3%A9/` is `/café/`. */
function pageAt(path: string, pages: ReadonlySet<string>): string | undefined {
  if (pages.has(path)) return path;
  try {
    const decoded = decodeURI(path);
    return pages.has(decoded) ? decoded : undefined;
  } catch {
    // A malformed escape names no page.
    return undefined;
  }
}

export function mount(pathname: string, options: BrowserOptions, context: BrowserScriptContext = { base: "" }) {
  const page = pageAt(pathname.slice(context.base.length), new Set(options.pages));
  const region = document.querySelector('[data-svartz-region="page-actions"]');
  if (!page || !region) return;
  const link = document.createElement("a");
  link.href = encodeURI(`${context.base}${options.mountPath}/-/history${page.slice(options.mountPath.length)}`);
  link.innerHTML = `${HISTORY_ICON}History`;
  region.append(link);
  return () => link.remove();
}
