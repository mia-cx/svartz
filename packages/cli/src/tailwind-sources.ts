import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "@svartz/config";
import { getGeneratedHostRegistryPath, getVaultBuildRoot, resolveThemePackageRoot } from "@svartz/vite";

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

function packageContentGlob(packageRoot: string): string {
  const sourceRoot = path.join(packageRoot, existsSync(path.join(packageRoot, "src")) ? "src" : "dist");
  return path.join(sourceRoot, "**/*.{svelte,js,ts}");
}

/** Collects Tailwind source globs for the resolved theme and its package deps (for example @svartz/ui). */
function getTailwindSourceGlobs(appRoot: string, vault: ResolvedConfig): string[] {
  const themeRoot = resolveThemePackageRoot(vault.theme.base, appRoot);
  if (!themeRoot) return [];

  const sourceGlobs = [packageContentGlob(themeRoot)];
  const packageJsonPath = path.join(themeRoot, "package.json");

  try {
    if (!existsSync(packageJsonPath)) {
      return sourceGlobs;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies?: Record<string, string>;
    };

    for (const packageName of Object.keys(packageJson.dependencies ?? {})) {
      const packageRoot = resolveThemePackageRoot(packageName, appRoot);
      if (!packageRoot || packageRoot === themeRoot) continue;
      sourceGlobs.push(packageContentGlob(packageRoot));
    }
  } catch {
    // Best effort only. If theme package metadata is missing or malformed, still scan the theme itself.
  }

  return dedupePaths(sourceGlobs.map((glob) => path.resolve(glob)));
}

function createTailwindSourcesCss(sourceGlobs: readonly string[], cssFilePath: string, hostApp = false): string {
  const cssDirectory = path.dirname(cssFilePath);
  const lines = [
    "/* Generated per-vault by svartz CLI. Tailwind scans the resolved theme and its component-library deps. */",
    ...(hostApp ? ["@import 'tailwindcss';"] : []),
    ...sourceGlobs.map((sourceGlob) => `@source "${toRelativeGlob(cssDirectory, sourceGlob)}";`),
    ...(hostApp ? ["@plugin '@tailwindcss/forms';", "@plugin '@tailwindcss/typography';"] : []),
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
  hostApp = false,
): Promise<string> {
  const cssFilePath = getGeneratedTailwindSourcesPath(vault);
  const sourceGlobs = getTailwindSourceGlobs(appRoot, vault);
  const cssSource = createTailwindSourcesCss(sourceGlobs, cssFilePath, hostApp);

  await mkdir(path.dirname(cssFilePath), { recursive: true });
  await writeFile(cssFilePath, cssSource);

  return cssFilePath;
}

async function writeGeneratedHostTailwindSourcesFile(
  appRoot: string,
  configDir: string,
  vaults: readonly ResolvedConfig[],
): Promise<string> {
  const cssFilePath = path.join(path.dirname(getGeneratedHostRegistryPath(configDir)), "tailwind-sources.css");
  const sourceGlobs = dedupePaths(vaults.flatMap((vault) => getTailwindSourceGlobs(appRoot, vault)));
  await mkdir(path.dirname(cssFilePath), { recursive: true });
  await writeFile(cssFilePath, createTailwindSourcesCss(sourceGlobs, cssFilePath, true));
  return cssFilePath;
}

export {
  createTailwindSourcesCss,
  getGeneratedTailwindSourcesPath,
  getTailwindSourceGlobs,
  writeGeneratedTailwindSourcesFile,
  writeGeneratedHostTailwindSourcesFile,
};
