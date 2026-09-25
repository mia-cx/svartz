import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveThemePackageRoot } from "@svartz/vite";

type WatchDescriptor = {
  readonly path: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly buildFilters?: readonly string[];
};

const CONFIG_FILENAMES = ["svartz.config", ".svartzrc"] as const;
const CONFIG_EXTENSIONS = [".ts", ".mjs", ".js"] as const;

function matchesWatchDescriptor(changedPath: string, descriptor: WatchDescriptor): boolean {
  const normalizedChangedPath = path.resolve(changedPath);
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

/** Watch editable themes, rebuilding workspace packages by their manifest name. */
function getThemeWatchDescriptors(
  themeBase: string,
  appRoot: string,
  workspaceRoot: string,
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
  const sourcePath = path.join(themeRoot, "src");
  return [
    {
      path: existsSync(sourcePath) ? sourcePath : themeRoot,
      label,
      buildFilters,
    },
    {
      path: packageJsonPath,
      label: `${themeBase} package`,
      exact: true,
      buildFilters,
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
  isLocalWorkspacePackage,
  matchesWatchDescriptor,
  uniqBuildFilters,
};
export type { WatchDescriptor };
