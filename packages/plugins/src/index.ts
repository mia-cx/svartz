/**
 * @svartz/plugins — core pipeline plugins for the Svartz build system.
 *
 * Exports individual plugin factories and a combined `createCorePlugins()`
 * that returns the canonical ordered set of core plugins.
 */

import type { NormalizedSvartzPlugin } from "@svartz/core";

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
  INDEX_CONTENT_ID,
  EMIT_ARTIFACTS_ID,
] as const;

export type CorePluginId = (typeof CORE_PLUGIN_IDS)[number];

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
    indexContent(),
    emitArtifacts(),
  ];
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
  INDEX_CONTENT_ID,
  EMIT_ARTIFACTS_ID,
};
