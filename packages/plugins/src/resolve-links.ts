/**
 * core:resolve-links — resolve raw wikilinks/markdown links to canonical slugs.
 *
 * Precondition: discoverFiles has produced stable slugs for all files.
 * Derives allSlugs from ctx.files.map(f => f.slug).
 *
 * Postcondition: every ProcessedFile has `links` containing resolved slug strings.
 */

import { definePlugin } from "@svartz/core";
import { resolveLink, buildSlugMap } from "./internal/resolve";

export const resolveLinks = definePlugin(() => ({
  id: "core:resolve-links",

  resolveLinks: {
    run(ctx) {
      const strategy = ctx.vault.linkResolution;
      const allSlugs = ctx.files.map((f) => f.slug);

      const slugSources = ctx.files.map((file) => {
        const aliases = Array.isArray(file.frontmatter?.aliases)
          ? (file.frontmatter.aliases as string[])
          : [];
        return { slug: file.slug, aliases };
      });

      const slugMap = buildSlugMap(slugSources);

      for (const file of ctx.files) {
        if (!file.rawLinks) {
          file.links = [];
          continue;
        }

        const resolved = new Set<string>();
        for (const rawLink of file.rawLinks) {
          const target = resolveLink(
            rawLink,
            slugMap,
            allSlugs,
            strategy,
            file.slug,
          );
          if (target !== null) {
            resolved.add(target);
          }
        }
        file.links = [...resolved];
      }
    },
    options: { fatal: true },
  },
}));

export const RESOLVE_LINKS_ID = "core:resolve-links" as const;
