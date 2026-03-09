/**
 * core:resolve-links — resolve raw wikilinks/markdown links to canonical slugs.
 *
 * Precondition: discoverFiles has produced stable slugs for all files.
 * Derives allSlugs from ctx.files.map(f => f.slug).
 *
 * Postcondition: every ProcessedFile has `links` containing resolved slug strings.
 */

import GithubSlugger from "github-slugger";
import { posix } from "node:path";
import { definePlugin } from "@svartz/core";
import { resolveLink, buildSlugMap } from "./internal/resolve";

function isMarkdownFile(extension: string | undefined): boolean {
  return extension !== undefined && [".md", ".mdx", ".svx"].includes(extension);
}

function slugToRouteDirectory(slug: string): string {
  return slug === "index" ? "/" : `/${slug}/`;
}

function toRelativeNoteHref(
  sourceSlug: string,
  targetSlug: string,
  section?: string,
): string {
  const relative = posix.relative(
    slugToRouteDirectory(sourceSlug),
    slugToRouteDirectory(targetSlug),
  );
  const baseHref =
    relative.length === 0 ? "./" : relative.endsWith("/") ? relative : `${relative}/`;

  if (!section) return baseHref;
  const slugger = new GithubSlugger();
  return `${baseHref}#${slugger.slug(section)}`;
}

function toRelativeAssetHref(sourceSlug: string, assetPath: string): string {
  const relative = posix.relative(
    slugToRouteDirectory(sourceSlug),
    `/${assetPath}`,
  );
  return relative.length === 0 ? "./" : relative;
}

function replaceLinkMarkup(
  markdown: string,
  raw: string,
  href: string,
  label: string,
): string {
  return markdown.split(raw).join(`<a href="${href}">${label}</a>`);
}

export const resolveLinks = definePlugin(() => ({
  id: "core:resolve-links",

  resolveLinks: {
    run(ctx) {
      const strategy = ctx.config.linkResolution;
      const noteFiles = ctx.files.filter((file) => isMarkdownFile(file.extension));
      const allSlugs = noteFiles.map((f) => f.slug);
      const assetFiles = ctx.files.filter((file) => !isMarkdownFile(file.extension));

      const slugSources = noteFiles.map((file) => {
        const aliases = Array.isArray(file.frontmatter?.[ctx.config.frontmatter.aliasesField])
          ? (file.frontmatter[ctx.config.frontmatter.aliasesField] as string[])
          : [];
        return { slug: file.slug, aliases };
      });

      const slugMap = buildSlugMap(slugSources);
      const assetMap = new Map<string, string>();
      for (const asset of assetFiles) {
        assetMap.set(asset.path.toLowerCase(), asset.path);
        assetMap.set((asset.path.split("/").pop() ?? asset.path).toLowerCase(), asset.path);
      }

      for (const file of ctx.files) {
        if (!isMarkdownFile(file.extension)) {
          file.links = [];
          continue;
        }

        if (!file.rawLinks) {
          file.links = [];
          continue;
        }

        const resolved = new Set<string>();
        let rewrittenContent = file.content;

        for (const rawLink of file.rawLinks) {
          const normalizedTarget = rawLink.target.trim().toLowerCase();
          const assetPath = assetMap.get(normalizedTarget);
          const label = rawLink.label ?? rawLink.target;

          if (assetPath) {
            rewrittenContent = replaceLinkMarkup(
              rewrittenContent,
              rawLink.raw,
              toRelativeAssetHref(file.slug, assetPath),
              label,
            );
            continue;
          }

          const target = resolveLink(
            rawLink,
            slugMap,
            allSlugs,
            strategy,
            file.slug,
          );
          if (target !== null) {
            resolved.add(target);
            rewrittenContent = replaceLinkMarkup(
              rewrittenContent,
              rawLink.raw,
              toRelativeNoteHref(file.slug, target, rawLink.section),
              label,
            );
          }
        }

        file.links = [...resolved];
        file.content = rewrittenContent;
      }
    },
    options: { fatal: true },
  },
}));

export const RESOLVE_LINKS_ID = "core:resolve-links" as const;
