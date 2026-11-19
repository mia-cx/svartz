/**
 * Which pages a note's Markdown claims, as permissions name them: what a commit must be allowed on beside the page it
 * writes, so restoring or saving frontmatter can't take a route from a page the committer may not change.
 */
import { alternateRoutes, extractFrontmatter, requestedSlug } from "@svartz/plugins/routes";
import type { BuildData } from "./server";

/** The routes the last build allocated, which a note's frontmatter can claim: JSON, for server data. */
export type RouteClaims = Pick<BuildData, "routes" | "aliases" | "aliasesField">;

/**
 * The pages `markdown` at `vaultPath` claims: every route the note would hold, read as the build reads it (its slug,
 * from frontmatter or its file name, and each route its aliases ask to redirect from), and any other page holding one
 * of them, which the note would move or take a redirect from. A route `self`, the page the file publishes as now,
 * already holds is no new claim. `undefined` for frontmatter the build would refuse, which claims nothing that can be
 * checked. Which page holds a route is judged from the last build.
 */
export function routeClaims({ routes, aliases, aliasesField }: RouteClaims) {
  const held = new Map(Object.entries(routes));
  const redirects = new Map(Object.entries(aliases));
  return (vaultPath: string, markdown: string, self: string | undefined): Set<string> | undefined => {
    let claimed: string[];
    try {
      const { frontmatter } = extractFrontmatter(markdown);
      claimed = [requestedSlug({ path: vaultPath, frontmatter }), ...alternateRoutes(frontmatter, aliasesField)];
    } catch {
      return undefined;
    }
    const objects = new Set<string>();
    for (const route of claimed) {
      const holders = [held.get(route), redirects.get(route)].filter((holder) => holder !== undefined);
      if (!holders.some(({ slug }) => slug === self)) objects.add(route);
      for (const { slug } of holders) if (slug !== self) objects.add(slug);
    }
    return objects;
  };
}
