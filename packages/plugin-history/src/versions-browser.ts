/** Adds Previous versions to the page actions of every note whose versions the build published from git. */
import type { BrowserScriptContext } from "@svartz/core";
import { HISTORY_ICON, pageAt } from "./browser";

/** What the browser script receives from `history({ source: "git" })`. */
export interface VersionsBrowserOptions {
  /** The routes below the deployment base of every note with versions; each lists them at `<route>versions/`. */
  readonly pages: readonly string[];
}

export function mount(pathname: string, options: VersionsBrowserOptions, context: BrowserScriptContext = { base: "" }) {
  const page = pageAt(pathname.slice(context.base.length), new Set(options.pages));
  const region = document.querySelector('[data-svartz-region="page-actions"]');
  if (!page || !region) return undefined;
  const link = document.createElement("a");
  link.href = encodeURI(`${context.base}${page}versions/`);
  link.innerHTML = `${HISTORY_ICON}Previous versions`;
  region.append(link);
  return () => link.remove();
}
