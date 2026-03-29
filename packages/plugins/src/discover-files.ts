// Copyright (c) mia.cx. See LICENSE at repository root.
/**
 * core:discover-files — traverse vault directory, read file contents, assign slugs.
 *
 * Postcondition: every ProcessedFile in ctx.files has a required `slug: string`
 * (vault-relative, extensionless, case-normalized via fileToSlug).
 *
 * Symlinks are intentionally not followed — folder symlinks don't surface in
 * Obsidian vaults, so there's nothing to support.
 */

import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fdir } from "fdir";
import { definePlugin } from "@svartz/core";
import { fileToSlug } from "./internal/slug";
import { shouldIgnore, shouldIncludePath } from "./internal/ignore";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".svx"]);

function isMarkdownFile(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
}

export const discoverFiles = definePlugin(() => ({
  id: "core:discover-files",

  discoverFiles: {
    async run(ctx) {
      const vaultPath = ctx.config.path;
      const include = ctx.config.include;
      const exclude = ctx.config.exclude;

      const filePaths = await new fdir()
        .withRelativePaths()
        .exclude((dirName) => shouldIgnore(dirName))
        .filter((relPath) => shouldIncludePath(relPath, include, exclude))
        .crawl(vaultPath)
        .withPromise();

      filePaths.sort((a, b) => a.localeCompare(b));

      ctx.files = await Promise.all(
        filePaths.map(async (relPath) => {
          const fullPath = join(vaultPath, relPath);
          const fileStat = await stat(fullPath);
          const extension = extname(relPath).toLowerCase();
          const content = isMarkdownFile(relPath)
            ? await readFile(fullPath, "utf-8")
            : "";
          return {
            path: relPath,
            slug: fileToSlug(relPath),
            sourcePath: fullPath,
            extension,
            content,
            createdAt: fileStat.birthtime,
            modifiedAt: fileStat.mtime,
          };
        }),
      );
    },
    options: { fatal: true },
  },
}));

export const DISCOVER_FILES_ID = "core:discover-files" as const;
