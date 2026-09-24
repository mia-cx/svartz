import GithubSlugger from "github-slugger";
import { posix } from "node:path";
import { definePlugin, type RawLink } from "@svartz/core";
import { buildSlugMap, resolveLink } from "./internal/resolve";
import { createAssetResolver } from "./internal/asset-references";
import { alternateNames } from "./internal/routes";
import { extractSectionMarkdown } from "./internal/parse";
import { transformInlineTags } from "./transform-ofm";

const EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
]);
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".wav",
  ".ogg",
  ".flac",
  ".webm",
  ".3gp",
]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".ogv", ".webm"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

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

function splitEmbedInner(inner: string): {
  target: string;
  section?: string;
  alias?: string;
} {
  const [targetWithSection, ...labelParts] = inner.split("|");
  const alias = labelParts.length > 0 ? labelParts.join("|").trim() : undefined;
  const [target, section] = targetWithSection!.split("#");
  return {
    target: target?.trim() ?? "",
    section: section?.trim() || undefined,
    alias: alias || undefined,
  };
}

function renderAssetEmbed(
  sourceSlug: string,
  assetPath: string,
  alias: string | undefined,
): string {
  const extension = assetPath.slice(assetPath.lastIndexOf(".")).toLowerCase();
  const href = relativeHref(sourceSlug, `/${assetPath}`)
    .split("/").map(encodeURIComponent).join("/");

  if (IMAGE_EXTENSIONS.has(extension)) {
    return `![${alias ?? ""}](${href})`;
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return `<audio controls src="${href}"></audio>`;
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return `<video controls src="${href}"></video>`;
  }

  if (PDF_EXTENSIONS.has(extension)) {
    return `<iframe class="svartz-pdf-embed" src="${href}" title="${alias ?? assetPath}"></iframe>`;
  }

  return `<a href="${href}">${alias ?? assetPath}</a>`;
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

        const expanded = embeddedMarkdown.replace(EMBED_REGEX, (_raw: string, inner: string) => {
          const parsed = splitEmbedInner(inner);
          const assetPath = resolveAsset(noteBySlug.get(targetSlug)!, parsed.target);
          if (assetPath) {
            return renderAssetEmbed(sourceSlug, assetPath, parsed.alias);
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

        const tagged = transformInlineTags(expanded, sourceSlug, tagsRoute);
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
        file.content = file.content.replace(EMBED_REGEX, (_raw: string, inner: string) => {
          const parsed = splitEmbedInner(inner);
          const assetPath = resolveAsset(file, parsed.target);
          if (assetPath) {
            return renderAssetEmbed(file.slug, assetPath, parsed.alias);
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
