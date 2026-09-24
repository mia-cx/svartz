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
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { createAssetResolver } from "./internal/asset-references";
import { resolveLink, buildSlugMap } from "./internal/resolve";
import { alternateNames, routeHref } from "./internal/routes";

const MARKDOWN_ASSET = /(!?\[[^\]]*\]\()([^\s)]+)(\))/g;
const HTML_ASSET = /(<(?:a|audio|iframe|img|source|video)\b[^>]*\b(?:href|src)\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;
const markdownParser = unified().use(remarkParse);

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
  return relative.length === 0
    ? "./"
    : relative.split("/").map(encodeURIComponent).join("/");
}

function replaceLinkMarkup(
  markdown: string,
  raw: string,
  href: string,
  label: string,
  type: "wikilink" | "markdown",
): string {
  if (type === "wikilink") return replaceWikilinkMarkup(markdown, raw, `<a href="${href}">${escapeHtml(label)}</a>`);
  const pattern = new RegExp(`(?<!!)${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
  return markdown.replace(pattern, () => `<a href="${href}">${escapeHtml(label)}</a>`);
}

function replaceWikilinkMarkup(markdown: string, raw: string, html: string): string {
  const pattern = new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const replacements: { start: number; end: number }[] = [];
  visit(markdownParser.parse(markdown), "text", (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    for (const match of markdown.slice(start, end).matchAll(pattern)) {
      const offset = start + match.index!;
      if (markdown[offset - 1] === "!") continue;
      replacements.push({ start: offset, end: offset + raw.length });
    }
  });
  let content = markdown;
  for (const replacement of replacements.reverse()) {
    content = content.slice(0, replacement.start) + html + content.slice(replacement.end);
  }
  return content;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function replaceMissingWikilink(markdown: string, raw: string, label: string): string {
  return replaceWikilinkMarkup(markdown, raw,
    `<span class="svartz-unresolved-link" role="link" aria-disabled="true">${escapeHtml(label)}</span>`);
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
        const aliases = alternateNames(file.frontmatter, ctx.config.frontmatter.aliasesField);
        return { slug: file.slug, path: file.path, aliases };
      });

      const slugMap = buildSlugMap(slugSources);
      const resolveAsset = createAssetResolver(assetFiles);

      for (const file of ctx.files) {
        if (!isMarkdownFile(file.extension)) {
          file.links = [];
          continue;
        }

        const resolved = new Set<string>();
        const linkTargets: Record<string, string> = {};
        let rewrittenContent = file.content.replace(
          MARKDOWN_ASSET,
          (raw, start: string, target: string, end: string) => {
            const assetPath = resolveAsset(file, target);
            return assetPath
              ? `${start}${toRelativeAssetHref(file.slug, assetPath)}${end}`
              : raw;
          },
        );
        rewrittenContent = rewrittenContent.replace(
          HTML_ASSET,
          (raw, start: string, target: string, end: string) => {
            const assetPath = resolveAsset(file, target);
            return assetPath
              ? `${start}${toRelativeAssetHref(file.slug, assetPath)}${end}`
              : raw;
          },
        );

        for (const rawLink of file.rawLinks ?? []) {
          const assetPath = resolveAsset(file, rawLink.target);
          const label = rawLink.label ?? rawLink.target;

          if (assetPath) {
            rewrittenContent = replaceLinkMarkup(
              rewrittenContent,
              rawLink.raw,
              toRelativeAssetHref(file.slug, assetPath),
              label,
              rawLink.type,
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
            linkTargets[rawLink.raw] = routeHref(target, ctx.config.mountPath);
            rewrittenContent = replaceLinkMarkup(
              rewrittenContent,
              rawLink.raw,
              toRelativeNoteHref(file.slug, target, rawLink.section),
              label,
              rawLink.type,
            );
          } else if (rawLink.type === "wikilink") {
            rewrittenContent = replaceMissingWikilink(rewrittenContent, rawLink.raw, label);
          }
        }

        file.links = [...resolved];
        file.linkTargets = linkTargets;
        file.content = rewrittenContent;
      }
    },
    options: { fatal: true },
  },
}));

export const RESOLVE_LINKS_ID = "core:resolve-links" as const;
