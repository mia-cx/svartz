/**
 * @svartz/plugins — core pipeline plugins for the Svartz build system.
 *
 * Exports individual plugin factories and a combined `createCorePlugins()`
 * that returns the canonical ordered set of core plugins.
 */

import { extname, isAbsolute, relative } from "node:path";
import type {
  ChangeEvent,
  NormalizedSvartzPlugin,
  PluginChangeHook,
  PluginContext,
} from "@svartz/core";

import {
  discoverFiles,
  DISCOVER_FILES_ID,
} from "./discover-files";
import {
  parseFrontmatter,
  PARSE_FRONTMATTER_ID,
} from "./parse-frontmatter";
import {
  filterUnpublished,
  FILTER_UNPUBLISHED_ID,
} from "./filter-unpublished";
import {
  resolveLinks,
  RESOLVE_LINKS_ID,
} from "./resolve-links";
import { transformOfm, TRANSFORM_OFM_ID } from "./transform-ofm";
import { transformGfm, TRANSFORM_GFM_ID } from "./transform-gfm";
import { transformToc, TRANSFORM_TOC_ID } from "./transform-toc";
import {
  transformDescription,
  TRANSFORM_DESCRIPTION_ID,
} from "./transform-description";
import {
  transformSyntax,
  TRANSFORM_SYNTAX_ID,
} from "./transform-syntax";
import {
  transformLatex,
  TRANSFORM_LATEX_ID,
} from "./transform-latex";
import {
  transformEmbeds,
  TRANSFORM_EMBEDS_ID,
} from "./transform-embeds";
import { indexContent, INDEX_CONTENT_ID } from "./index-content";
import { emitArtifacts, EMIT_ARTIFACTS_ID } from "./emit-artifacts";

export const CORE_PLUGIN_IDS = [
  DISCOVER_FILES_ID,
  PARSE_FRONTMATTER_ID,
  FILTER_UNPUBLISHED_ID,
  RESOLVE_LINKS_ID,
  TRANSFORM_OFM_ID,
  TRANSFORM_GFM_ID,
  TRANSFORM_TOC_ID,
  TRANSFORM_DESCRIPTION_ID,
  TRANSFORM_SYNTAX_ID,
  TRANSFORM_LATEX_ID,
  TRANSFORM_EMBEDS_ID,
  INDEX_CONTENT_ID,
  EMIT_ARTIFACTS_ID,
] as const;

export type CorePluginId = (typeof CORE_PLUGIN_IDS)[number];

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".svx"]);

function getRelativeVaultPath(
  event: ChangeEvent,
  ctx: PluginContext,
): string | undefined {
  const relativeFile = event.relativeFile;
  if (typeof relativeFile === "string" && relativeFile.length > 0) {
    return relativeFile;
  }

  if (!isAbsolute(event.file)) {
    return event.file;
  }

  const relativePath = relative(ctx.config.path, event.file);
  if (relativePath.startsWith("..")) {
    return undefined;
  }

  return relativePath.replaceAll("\\", "/");
}

function isMarkdownChange(relativePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(relativePath).toLowerCase());
}

function recordRelevantCoreChange(
  ctx: PluginContext,
  pluginId: CorePluginId,
  event: ChangeEvent,
  relativePath: string,
): void {
  const changedPlugins =
    (ctx.meta.get("svartz:changedPlugins") as Set<string> | undefined) ?? new Set();
  changedPlugins.add(pluginId);
  ctx.meta.set("svartz:changedPlugins", changedPlugins);
  ctx.meta.set("svartz:lastChange", {
    ...event,
    relativeFile: relativePath,
  });
}

function shouldHandleCoreChange(
  pluginId: CorePluginId,
  relativePath: string,
): boolean {
  const markdownChange = isMarkdownChange(relativePath);

  switch (pluginId) {
    case DISCOVER_FILES_ID:
    case RESOLVE_LINKS_ID:
    case INDEX_CONTENT_ID:
    case EMIT_ARTIFACTS_ID:
      return true;
    case PARSE_FRONTMATTER_ID:
    case FILTER_UNPUBLISHED_ID:
    case TRANSFORM_OFM_ID:
    case TRANSFORM_GFM_ID:
    case TRANSFORM_TOC_ID:
    case TRANSFORM_DESCRIPTION_ID:
    case TRANSFORM_SYNTAX_ID:
    case TRANSFORM_LATEX_ID:
    case TRANSFORM_EMBEDS_ID:
      return markdownChange;
  }
}

function createCoreHandleChange(pluginId: CorePluginId): PluginChangeHook {
  return {
    run(event, ctx) {
      const relativePath = getRelativeVaultPath(event, ctx);
      if (!relativePath) return;
      if (!shouldHandleCoreChange(pluginId, relativePath)) return;

      if (
        pluginId === PARSE_FRONTMATTER_ID ||
        pluginId === TRANSFORM_EMBEDS_ID
      ) {
        ctx.meta.delete("sourceBodies");
      }

      recordRelevantCoreChange(ctx, pluginId, event, relativePath);
    },
  };
}

function attachCoreHandleChange(
  plugin: NormalizedSvartzPlugin,
): NormalizedSvartzPlugin {
  if (plugin.handleChange) {
    return plugin;
  }

  return {
    ...plugin,
    handleChange: createCoreHandleChange(plugin.id as CorePluginId),
  };
}

/**
 * Create the canonical ordered set of core plugins.
 * Returned array matches the pipeline execution order.
 */
export function createCorePlugins(): NormalizedSvartzPlugin[] {
  return [
    discoverFiles(),
    parseFrontmatter(),
    filterUnpublished(),
    resolveLinks(),
    transformOfm(),
    transformGfm(),
    transformToc(),
    transformDescription(),
    transformSyntax(),
    transformLatex(),
    transformEmbeds(),
    indexContent(),
    emitArtifacts(),
  ].map(attachCoreHandleChange);
}

// Re-export individual factories for selective use
export {
  discoverFiles,
  parseFrontmatter,
  filterUnpublished,
  resolveLinks,
  transformOfm,
  transformGfm,
  transformToc,
  transformDescription,
  transformSyntax,
  transformLatex,
  transformEmbeds,
  indexContent,
  emitArtifacts,
};

// Re-export IDs
export {
  DISCOVER_FILES_ID,
  PARSE_FRONTMATTER_ID,
  FILTER_UNPUBLISHED_ID,
  RESOLVE_LINKS_ID,
  TRANSFORM_OFM_ID,
  TRANSFORM_GFM_ID,
  TRANSFORM_TOC_ID,
  TRANSFORM_DESCRIPTION_ID,
  TRANSFORM_SYNTAX_ID,
  TRANSFORM_LATEX_ID,
  TRANSFORM_EMBEDS_ID,
  INDEX_CONTENT_ID,
  EMIT_ARTIFACTS_ID,
};
