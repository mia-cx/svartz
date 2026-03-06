/**
 * core:discover-files — traverse vault directory, read file contents, assign slugs.
 *
 * Postcondition: every ProcessedFile in ctx.files has a required `slug: string`
 * (vault-relative, extensionless, case-normalized via fileToSlug).
 */

import { readdir, readFile, lstat, realpath, stat } from "node:fs/promises";
import { join, extname, relative, basename } from "node:path";
import { definePlugin } from "@svartz/core";
import { fileToSlug } from "./internal/slug";
import { shouldIgnore, shouldIncludePath } from "./internal/ignore";

const MAX_SYMLINK_DEPTH = 4;

export const discoverFiles = definePlugin(() => ({
  id: "core:discover-files",

  discoverFiles: {
    async run(ctx) {
      const vaultPath = ctx.config.path;
      const include = ctx.config.include;
      const exclude = ctx.config.exclude;

      const visitedInodes = new Set<number>();
      const filePaths: string[] = [];

      const walk = async (dir: string, symlinkDepth: number): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (shouldIgnore(entry.name)) continue;

          const fullPath = join(dir, entry.name);
          const entryLstat = await lstat(fullPath);

          if (entryLstat.isSymbolicLink()) {
            if (symlinkDepth >= MAX_SYMLINK_DEPTH) continue;

            const resolved = await realpath(fullPath);
            const resolvedStat = await stat(resolved);

            if (visitedInodes.has(resolvedStat.ino)) continue;
            visitedInodes.add(resolvedStat.ino);

            if (resolvedStat.isDirectory()) {
              await walk(resolved, symlinkDepth + 1);
              continue;
            }

            if (resolvedStat.isFile() && extname(entry.name) === ".md") {
              const relPath = relative(vaultPath, fullPath);
              if (shouldIncludePath(relPath, include, exclude)) {
                filePaths.push(relPath);
              }
            }
            continue;
          }

          if (entry.isDirectory()) {
            const dirStat = await stat(fullPath);
            visitedInodes.add(dirStat.ino);
            await walk(fullPath, symlinkDepth);
            continue;
          }

          if (entry.isFile() && extname(entry.name) === ".md") {
            const relPath = relative(vaultPath, fullPath);
            if (shouldIncludePath(relPath, include, exclude)) {
              filePaths.push(relPath);
            }
          }
        }
      };

      await walk(vaultPath, 0);
      filePaths.sort((a, b) => a.localeCompare(b));

      ctx.files = await Promise.all(
        filePaths.map(async (relPath) => {
          const fullPath = join(vaultPath, relPath);
          const content = await readFile(fullPath, "utf-8");
          return {
            path: relPath,
            slug: fileToSlug(relPath),
            content,
          };
        }),
      );
    },
    options: { fatal: true },
  },
}));

export const DISCOVER_FILES_ID = "core:discover-files" as const;
