/** Where the plugin's pages and routes are, from a context of this plugin, and what a form may send a moderator back to. */
import type { PageContext } from "@svartz/core";
import { PLUGIN_ID } from "./api";

/** `<base><mount>` from a context of this plugin. */
export const vaultPath = (context: Pick<PageContext, "base">) => context.base.slice(0, -`/_svartz/${PLUGIN_ID}`.length);

/** The path of this plugin's dashboard panel `panel`. */
export const panelPath = (context: Pick<PageContext, "base">, panel: string) => `${vaultPath(context)}/-/dashboard/${PLUGIN_ID}/${panel}/`;

/**
 * `candidate` when it's a path on `url`'s site, with its query and fragment; `undefined` otherwise. Checked after
 * normalizing too: dot segments can fold a path like `/a/..//evil.test/` into `//evil.test/`, which a browser reads as
 * another site.
 */
export function sameSitePath(candidate: string | null | undefined, url: URL): string | undefined {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) return undefined;
  const target = new URL(candidate, url.origin);
  if (target.origin !== url.origin || target.pathname.startsWith("//")) return undefined;
  return `${target.pathname}${target.search}${target.hash}`;
}

/** Same-site `path` with its `status` query set to `status`, keeping its other parameters and fragment. */
export function withStatus(path: string, status: string, url: URL): string {
  const target = new URL(path, url.origin);
  target.searchParams.set("status", status);
  return `${target.pathname}${target.search}${target.hash}`;
}
