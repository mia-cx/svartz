import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "@svartz/config";
import { getVaultBuildRoot } from "@svartz/vite";
import { findPackageRootForModule } from "./dev-watch";

function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function toRelativeGlob(fromDirectory: string, targetGlob: string): string {
  const relativePath = path.relative(fromDirectory, targetGlob);
  const normalizedPath = toPosixPath(relativePath);
  if (normalizedPath.startsWith(".") || normalizedPath.startsWith("/")) {
    return normalizedPath;
  }
  return `./${normalizedPath}`;
}

/** Collects Tailwind source globs for the resolved theme and its package deps (for example @svartz/ui). */
function getTailwindSourceGlobs(appRoot: string, vault: ResolvedConfig): string[] {
  const themeRoot = findPackageRootForModule(vault.theme.base, appRoot);
  if (!themeRoot) return [];

  const sourceGlobs = [path.join(themeRoot, "src", "**/*.{svelte,ts}")];
  const packageJsonPath = path.join(themeRoot, "package.json");

  try {
    if (!existsSync(packageJsonPath)) {
      return sourceGlobs;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const packageName of Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    })) {
      const packageRoot = findPackageRootForModule(packageName, appRoot);
      if (!packageRoot || packageRoot === themeRoot) continue;
      sourceGlobs.push(path.join(packageRoot, "src", "**/*.{svelte,ts}"));
    }
  } catch {
    // Best effort only. If theme package metadata is missing or malformed, still scan the theme itself.
  }

  return dedupePaths(sourceGlobs.map((glob) => path.resolve(glob)));
}

function createTailwindSourcesCss(sourceGlobs: readonly string[], cssFilePath: string): string {
  const cssDirectory = path.dirname(cssFilePath);
  const lines = [
    "/* Generated per-vault by svartz CLI. Tailwind scans the resolved theme and its component-library deps. */",
    ...sourceGlobs.map((sourceGlob) => `@source "${toRelativeGlob(cssDirectory, sourceGlob)}";`),
    "",
  ];
  return lines.join("\n");
}

function getGeneratedTailwindSourcesPath(vault: ResolvedConfig): string {
  return path.join(getVaultBuildRoot(vault), "tailwind-sources.css");
}

async function writeGeneratedTailwindSourcesFile(
  appRoot: string,
  vault: ResolvedConfig,
): Promise<string> {
  const cssFilePath = getGeneratedTailwindSourcesPath(vault);
  const sourceGlobs = getTailwindSourceGlobs(appRoot, vault);
  const cssSource = createTailwindSourcesCss(sourceGlobs, cssFilePath);

  await mkdir(path.dirname(cssFilePath), { recursive: true });
  await writeFile(cssFilePath, cssSource);

  return cssFilePath;
}

export {
  createTailwindSourcesCss,
  getGeneratedTailwindSourcesPath,
  getTailwindSourceGlobs,
  writeGeneratedTailwindSourcesFile,
};
