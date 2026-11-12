import GithubSlugger from "github-slugger";
import { posix } from "node:path";
import { definePlugin, type RawLink } from "@svartz/core";
import { buildSlugMap, resolveLink } from "./internal/resolve";
import { createAssetResolver } from "./internal/asset-references";
import { encodeAttachmentPath, renderAssetEmbed, splitEmbedInner } from "./internal/attachments";
import { alternateNames } from "./internal/routes";
import { replaceEmbeds } from "./internal/link-spans";
import { extractSectionMarkdown, findWikilinkSpans, type PositionedLink } from "./internal/parse";
import { transformMarkdown } from "./transform-ofm";

function isMarkdownFile(extension: string | undefined): boolean {
  return extension !== undefined && [".md", ".mdx", ".svx"].includes(extension);
}

function routeDirectoryForSlug(slug: string): string {
  return slug === "index" ? "/" : `/${slug}/`;
}

function relativeHref(sourceSlug: string, targetPath: string): string {
  const relative = posix.relative(routeDirectoryForSlug(sourceSlug), targetPath);
  return relative.length === 0 ? "./" : relative;
}

function relativeNoteHref(
  sourceSlug: string,
  targetSlug: string,
  section?: string,
): string {
  const basePath = targetSlug === "index" ? "/" : `/${targetSlug}/`;
  const baseHref = relativeHref(sourceSlug, basePath);
  if (!section) return baseHref.endsWith("/") ? baseHref : `${baseHref}/`;

  const slugger = new GithubSlugger();
  const normalizedBase =
    baseHref === "./" ? baseHref : baseHref.endsWith("/") ? baseHref : `${baseHref}/`;
  return `${normalizedBase}#${slugger.slug(section)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

/** An attachment embed in the note at `sourceSlug`, linking the attachment relative to the note's page. */
function embedAsset(sourceSlug: string, assetPath: string, alias: string | undefined): string {
  return renderAssetEmbed(encodeAttachmentPath(relativeHref(sourceSlug, `/${assetPath}`)), assetPath, alias);
}

export const transformEmbeds = definePlugin(() => ({
  id: "core:transform-embeds",

  transformEmbeds: {
    run(ctx) {
      const noteFiles = ctx.files.filter((file) => isMarkdownFile(file.extension));
      const assetFiles = ctx.files.filter((file) => !isMarkdownFile(file.extension));
      const slugMap = buildSlugMap(
        noteFiles.map((file) => ({
          slug: file.slug,
          path: file.path,
          aliases: alternateNames(file.frontmatter, ctx.config.frontmatter.aliasesField),
        })),
      );
      const allSlugs = noteFiles.map((file) => file.slug);
      const sourceBodies =
        (ctx.meta.get("sourceBodies") as Map<string, string> | undefined) ?? new Map();
      const routes = ctx.config.theme.routes as { tags?: string } | undefined;
      const tagsRoute = routes?.tags ?? "tags";
      const noteBySlug = new Map(noteFiles.map((file) => [file.slug, file] as const));
      const resolveAsset = createAssetResolver(assetFiles);

      const expandEmbed = (
        sourceSlug: string,
        sourceGroup: string | undefined,
        targetSlug: string,
        section: string | undefined,
        alias: string | undefined,
        seen: Set<string>,
        hostTags: Set<string>,
      ): string => {
        const target = noteBySlug.get(targetSlug);
        if (target?.protection && target.protection.group !== sourceGroup) {
          const title = target.protection.hidden
            ? "Locked note"
            : String(target.frontmatter?.[ctx.config.frontmatter.titleField] ?? targetSlug);
          return `<div class="svartz-embed svartz-embed-locked" data-svartz-locked><a href="${relativeNoteHref(sourceSlug, targetSlug, section)}">${escapeHtml(alias ?? title)}</a></div>`;
        }

        const visitKey = `${targetSlug}#${section ?? ""}`;
        if (seen.has(visitKey)) {
          return `<p><a href="${relativeNoteHref(sourceSlug, targetSlug, section)}">${alias ?? targetSlug}</a></p>`;
        }

        seen.add(visitKey);
        const targetSource = sourceBodies.get(noteBySlug.get(targetSlug)?.path ?? "") ?? noteBySlug.get(targetSlug)?.content;
        if (!targetSource) {
          return `<p><a href="${relativeNoteHref(sourceSlug, targetSlug, section)}">${alias ?? targetSlug}</a></p>`;
        }

        const embeddedMarkdown = section
          ? extractSectionMarkdown(targetSource, new GithubSlugger().slug(section)) ?? targetSource
          : targetSource;

        const expanded = replaceEmbeds(embeddedMarkdown, (_raw, inner) => {
          const parsed = splitEmbedInner(inner);
          const assetPath = resolveAsset(noteBySlug.get(targetSlug)!, parsed.target);
          if (assetPath) {
            return embedAsset(sourceSlug, assetPath, parsed.alias);
          }

          const resolvedTarget = resolveLink(
            {
              raw: inner,
              target: parsed.target,
              section: parsed.section,
              label: parsed.alias,
              type: "wikilink",
            } satisfies RawLink,
            slugMap,
            allSlugs,
            ctx.config.linkResolution,
            targetSlug,
            noteFiles,
          );

          if (!resolvedTarget) {
            return `<p>${parsed.alias ?? parsed.target}</p>`;
          }

          return expandEmbed(
            sourceSlug,
            sourceGroup,
            resolvedTarget,
            parsed.section,
            parsed.alias,
            new Set(seen),
            hostTags,
          );
        });

        // The target's raw source skipped link resolution and the OFM transforms; apply both here.
        // Spans come from parsed Markdown, so code, escapes, and raw HTML keep their wikilink text.
        const linkHtml = (link: PositionedLink) => {
          const label = escapeHtml(link.label ?? link.target);
          const assetPath = resolveAsset(noteBySlug.get(targetSlug)!, link.target);
          if (assetPath) return `<a href="${relativeHref(sourceSlug, `/${assetPath}`)}">${label}</a>`;
          const resolved = resolveLink(link, slugMap, allSlugs, ctx.config.linkResolution, targetSlug, noteFiles);
          return resolved ? `<a href="${relativeNoteHref(sourceSlug, resolved, link.section)}">${label}</a>` : label;
        };
        const linked = findWikilinkSpans(expanded).reduceRight(
          (markdown, link) => markdown.slice(0, link.start) + linkHtml(link) + markdown.slice(link.end),
          expanded,
        );
        const tagged = transformMarkdown(linked, sourceSlug, tagsRoute, false);
        for (const tag of tagged.tags) hostTags.add(tag);

        return [
          `<div class="svartz-embed" data-embed="${targetSlug}">`,
          `<p class="svartz-embed-source"><a href="${relativeNoteHref(sourceSlug, targetSlug, section)}">${alias ?? noteBySlug.get(targetSlug)?.frontmatter?.[ctx.config.frontmatter.titleField] ?? targetSlug}</a></p>`,
          "",
          tagged.content,
          "",
          "</div>",
        ].join("\n");
      };

      for (const file of noteFiles) {
        const hostTags = new Set(file.inlineTags ?? []);
        file.content = replaceEmbeds(file.content, (_raw, inner) => {
          const parsed = splitEmbedInner(inner);
          const assetPath = resolveAsset(file, parsed.target);
          if (assetPath) {
            return embedAsset(file.slug, assetPath, parsed.alias);
          }

          const resolvedTarget = resolveLink(
            {
              raw: inner,
              target: parsed.target,
              section: parsed.section,
              label: parsed.alias,
              type: "wikilink",
            } satisfies RawLink,
            slugMap,
            allSlugs,
            ctx.config.linkResolution,
            file.slug,
            noteFiles,
          );

          if (!resolvedTarget) {
            return `<p>${parsed.alias ?? parsed.target}</p>`;
          }

          return expandEmbed(
            file.slug,
            file.protection?.group,
            resolvedTarget,
            parsed.section,
            parsed.alias,
            new Set([file.slug]),
            hostTags,
          );
        });
        file.inlineTags = [...hostTags];
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_EMBEDS_ID = "core:transform-embeds" as const;
