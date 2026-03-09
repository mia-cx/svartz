import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

type WatchDescriptor = {
  readonly path: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly buildFilters?: readonly string[];
};

const CONFIG_FILENAMES = ["svartz.config", ".svartzrc"] as const;
const CONFIG_EXTENSIONS = [".ts", ".mjs", ".js"] as const;
const require = createRequire(import.meta.url);

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

function findPackageRootForModule(moduleId: string): string | undefined {
  try {
    let current = path.dirname(require.resolve(moduleId));

    while (true) {
      const packageJsonPath = path.join(current, "package.json");
      if (existsSync(packageJsonPath)) {
        return current;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        return undefined;
      }

      current = parent;
    }
  } catch {
    return undefined;
  }
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
  findPackageRootForModule,
  getConfigWatchDescriptors,
  matchesWatchDescriptor,
  uniqBuildFilters,
};
export type { WatchDescriptor };
