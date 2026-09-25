import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveThemePackageRoot } from "@svartz/vite";
import { loadConfigFromFile } from "vite";

type WatchDescriptor = {
  readonly path: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly buildFilters?: readonly string[];
  readonly buildDirectory?: string;
};

const CONFIG_FILENAMES = ["svartz.config", ".svartzrc"] as const;
const CONFIG_EXTENSIONS = [".ts", ".mjs", ".js"] as const;

/**
 * Build output that lands inside watched source trees. Paraglide regenerates
 * `src/lib/paraglide` on every package build; reacting to it restarts the build
 * that wrote it, forever.
 */
const GENERATED_SOURCE_SEGMENTS = [`${path.sep}paraglide${path.sep}`] as const;

function matchesWatchDescriptor(changedPath: string, descriptor: WatchDescriptor): boolean {
  const normalizedChangedPath = path.resolve(changedPath);
  if (GENERATED_SOURCE_SEGMENTS.some((segment) => normalizedChangedPath.includes(segment))) {
    return false;
  }
  const normalizedDescriptorPath = path.resolve(descriptor.path);

  if (descriptor.exact) {
    return normalizedChangedPath === normalizedDescriptorPath;
  }

  const relativePath = path.relative(normalizedDescriptorPath, normalizedChangedPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function getConfigWatchDescriptors(
  configDir: string,
  explicitConfigPath?: string,
): WatchDescriptor[] {
  if (explicitConfigPath && path.extname(explicitConfigPath)) {
    return [
      {
        path: path.resolve(explicitConfigPath),
        label: "svartz config",
        exact: true,
      },
    ];
  }

  return CONFIG_FILENAMES.flatMap((baseName) =>
    CONFIG_EXTENSIONS.map((extension) => ({
      path: path.resolve(configDir, `${baseName}${extension}`),
      label: "svartz config",
      exact: true,
    })),
  );
}

/** Vite reports local imports of its config, which the CLI must watch after disabling Vite's own config watcher. */
async function getViteConfigWatchDescriptors(configPath: string, appRoot: string): Promise<WatchDescriptor[]> {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development" }, configPath, appRoot,
  );
  return [configPath, ...(loaded?.dependencies ?? [])].map((filePath) => ({
    path: path.resolve(filePath),
    label: "SvelteKit Vite config",
    exact: true,
  }));
}

function isLocalWorkspacePackage(packageRoot: string, workspaceRoot: string): boolean {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const normalizedNodeModulesRoot = path.join(normalizedWorkspaceRoot, "node_modules");
  const normalizedPackageRoot = path.resolve(packageRoot);
  const relativeToWorkspace = path.relative(normalizedWorkspaceRoot, normalizedPackageRoot);
  const relativeToNodeModules = path.relative(normalizedNodeModulesRoot, normalizedPackageRoot);

  const isInWorkspace =
    relativeToWorkspace === "" ||
    (!relativeToWorkspace.startsWith("..") && !path.isAbsolute(relativeToWorkspace));
  const isInNodeModules =
    relativeToNodeModules === "" ||
    (!relativeToNodeModules.startsWith("..") && !path.isAbsolute(relativeToNodeModules));

  return isInWorkspace && !isInNodeModules;
}

/** Watch editable themes and rebuild local packages before restarting dev. */
function getThemeWatchDescriptors(
  themeBase: string,
  appRoot: string,
  workspaceRoot: string,
  hostApp = false,
): WatchDescriptor[] {
  const themeRoot = resolveThemePackageRoot(themeBase, appRoot);
  if (!themeRoot) return [];

  const isWorkspaceTheme = isLocalWorkspacePackage(themeRoot, workspaceRoot);
  if (!isWorkspaceTheme && !path.isAbsolute(themeBase)) return [];

  const label = `${themeBase} source`;
  if (!isWorkspaceTheme) return [{ path: themeRoot, label }];

  const packageJsonPath = path.join(themeRoot, "package.json");
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
  const buildFilters = typeof manifest.name === "string" ? [manifest.name] : [];
  const build = hostApp ? { buildDirectory: themeRoot } : { buildFilters };
  const sourcePath = path.join(themeRoot, "src");
  return [
    {
      path: existsSync(sourcePath) ? sourcePath : themeRoot,
      label,
      ...build,
    },
    {
      path: packageJsonPath,
      label: `${themeBase} package`,
      exact: true,
      ...build,
    },
  ];
}

function createWorkspaceSourceWatchDescriptors(workspaceRoot: string): WatchDescriptor[] {
  return [
    {
      path: path.join(workspaceRoot, "packages/config/src"),
      label: "@svartz/config source",
      buildFilters: ["@svartz/config"],
    },
    {
      path: path.join(workspaceRoot, "packages/core/src"),
      label: "@svartz/core source",
      buildFilters: ["@svartz/core"],
    },
    {
      path: path.join(workspaceRoot, "packages/plugins/src"),
      label: "@svartz/plugins source",
      buildFilters: ["@svartz/plugins"],
    },
    {
      path: path.join(workspaceRoot, "packages/vite/src"),
      label: "@svartz/vite source",
      buildFilters: ["@svartz/vite"],
    },
    {
      path: path.join(workspaceRoot, "packages/ui/src"),
      label: "@svartz/ui source",
      buildFilters: ["@svartz/ui"],
    },
  ];
}

function uniqBuildFilters(filters: readonly string[]): string[] {
  return [...new Set(filters)];
}

export {
  createWorkspaceSourceWatchDescriptors,
  getThemeWatchDescriptors,
  getConfigWatchDescriptors,
  getViteConfigWatchDescriptors,
  isLocalWorkspacePackage,
  matchesWatchDescriptor,
  uniqBuildFilters,
};
export type { WatchDescriptor };
