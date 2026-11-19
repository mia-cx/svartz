/**
 * Adds History to the page actions of every page with a history, beside Copy page and Edit; on a user page, the
 * account's contributions below the note; and on `/-/account/`, a link to the reader's contributions.
 */
import type { BrowserScriptContext } from "@svartz/core";
import { PLUGIN_ID, type BrowserOptions } from "./api";

// Lucide "history", as the theme's other actions draw their icons.
const HISTORY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>';

/** The index's route for `path`, which a URL may percent-encode: `/caf%C3%A9/` is `/café/`, `/a%26b/` is `/a&b/`. */
function pageAt(path: string, pages: ReadonlySet<string>): string | undefined {
  if (pages.has(path)) return path;
  try {
    const decoded = decodeURIComponent(path);
    return pages.has(decoded) ? decoded : undefined;
  } catch {
    // A malformed escape names no page.
    return undefined;
  }
}

/**
 * Show the contributions of the account whose user page is `page` after `note`, the page's note body, as annotations
 * attaches its comments: beside the theme's markup, never in it. The server decides which pages are user pages and
 * renders the section. Answers what removes it.
 */
function showContributions(note: HTMLElement, endpoint: string, page: string): () => void {
  const controller = new AbortController();
  let section: Element | undefined;
  fetch(`${endpoint}/contributions/?page=${encodeURIComponent(page)}`, { signal: controller.signal, headers: { accept: "text/html" } })
    .then(async (response) => {
      if (!response.ok) return;
      const template = document.createElement("template");
      template.innerHTML = await response.text();
      section = template.content.firstElementChild ?? undefined;
      if (section && !controller.signal.aborted) note.after(section);
    })
    .catch((error: unknown) => {
      if (!controller.signal.aborted) console.error("[svartz:history] couldn't load this page's contributions", error);
    });
  return () => {
    controller.abort();
    section?.remove();
  };
}

export function mount(pathname: string, options: BrowserOptions, context: BrowserScriptContext = { base: "" }) {
  const home = `${context.base}${options.mountPath}`;
  const cleanups: Array<() => void> = [];

  // On `/-/account/`, auth leaves this region in its Reputation section for links to the account's activity.
  const activity = document.querySelector<HTMLElement>('[data-svartz-region="account-activity"]');
  const handle = activity?.dataset.svartzHandle;
  if (activity && handle) {
    const link = document.createElement("a");
    link.href = `${encodeURI(`${home}/-/contributions/`)}${encodeURIComponent(handle)}/`;
    link.textContent = "Your contributions";
    activity.append(link);
    cleanups.push(() => link.remove());
  }

  const page = pageAt(pathname.slice(context.base.length), new Set(options.pages));
  const region = document.querySelector('[data-svartz-region="page-actions"]');
  if (page && region) {
    const link = document.createElement("a");
    link.href = encodeURI(`${home}/-/history${page.slice(options.mountPath.length)}`);
    link.innerHTML = `${HISTORY_ICON}History`;
    region.append(link);
    cleanups.push(() => link.remove());
  }

  const note = context.note ?? document.querySelector<HTMLElement>("[data-svartz-note]");
  if (page && note && options.userPages && page.startsWith(options.userPages)) {
    cleanups.push(showContributions(note, `${home}/_svartz/${PLUGIN_ID}`, page));
  }

  if (cleanups.length === 0) return undefined;
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
