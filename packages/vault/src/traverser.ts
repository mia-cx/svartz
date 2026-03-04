import { Effect } from "effect";
import { readdir, stat, lstat, realpath } from "node:fs/promises";
import { join, extname, basename, relative } from "node:path";
import type { VaultFile, TraverseVaultOptions } from "./types.js";
import { VaultNotFound } from "./types.js";
import { shouldIgnore, shouldIncludePath } from "./utils/ignore.js";

const MAX_SYMLINK_DEPTH = 4;

/**
 * Recursively traverse an Obsidian vault directory and discover .md files.
 * Returns an Effect that fails with VaultNotFound if the vault path doesn't exist.
 */
export const traverseVault = (
  vaultPath: string,
  options: TraverseVaultOptions = {},
): Effect.Effect<VaultFile[], VaultNotFound> => {
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];

  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => stat(vaultPath),
      catch: () =>
        new VaultNotFound({
          path: vaultPath,
          message: `Vault path does not exist: ${vaultPath}`,
        }),
    });

    const files: VaultFile[] = [];
    const visitedInodes = new Set<number>();

    const walk = (dir: string, symlinkDepth: number): Effect.Effect<void> =>
      Effect.gen(function* () {
        const entries = yield* Effect.promise(() =>
          readdir(dir, { withFileTypes: true }),
        );

        for (const entry of entries) {
          if (shouldIgnore(entry.name)) continue;

          const fullPath = join(dir, entry.name);
          const entryLstat = yield* Effect.promise(() => lstat(fullPath));

          if (entryLstat.isSymbolicLink()) {
            if (symlinkDepth >= MAX_SYMLINK_DEPTH) continue;

            const resolved = yield* Effect.promise(() => realpath(fullPath));
            const resolvedStat = yield* Effect.promise(() => stat(resolved));

            if (visitedInodes.has(resolvedStat.ino)) continue;
            visitedInodes.add(resolvedStat.ino);

            if (resolvedStat.isDirectory()) {
              yield* walk(resolved, symlinkDepth + 1);
              continue;
            }

            if (resolvedStat.isFile() && extname(entry.name) === ".md") {
              const relPath = relative(vaultPath, fullPath);
              if (!shouldIncludePath(relPath, include, exclude)) continue;
              files.push({
                path: relPath,
                name: basename(entry.name, extname(entry.name)),
                extension: extname(entry.name),
                isDirectory: false,
              });
            }
            continue;
          }

          if (entry.isDirectory()) {
            const dirStat = yield* Effect.promise(() => stat(fullPath));
            visitedInodes.add(dirStat.ino);
            yield* walk(fullPath, symlinkDepth);
            continue;
          }

          if (entry.isFile() && extname(entry.name) === ".md") {
            const relPath = relative(vaultPath, fullPath);
            if (!shouldIncludePath(relPath, include, exclude)) continue;
            files.push({
              path: relPath,
              name: basename(entry.name, extname(entry.name)),
              extension: extname(entry.name),
              isDirectory: false,
            });
          }
        }
      });

    yield* walk(vaultPath, 0);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  });
};
