import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"] as const;

interface AppLocation {
  readonly appRoot: string;
  readonly projectRoot: string;
  readonly hostApp: boolean;
  readonly viteConfigPath: string;
}

function findViteConfig(root: string): string | undefined {
  return VITE_CONFIG_FILES.map((name) => path.join(root, name)).find(existsSync);
}

/** Detect an existing SvelteKit host before falling back to the repository shell. */
function resolveAppLocation(configDir: string): AppLocation {
  const projectRoot = path.resolve(configDir);
  const packageJsonPath = path.join(projectRoot, "package.json");
  const viteConfigPath = findViteConfig(projectRoot);
  if (viteConfigPath && existsSync(packageJsonPath)) {
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (manifest.dependencies?.["@sveltejs/kit"] || manifest.devDependencies?.["@sveltejs/kit"]) {
      return { appRoot: projectRoot, projectRoot, hostApp: true, viteConfigPath };
    }
  }

  const appRoot = path.join(projectRoot, "apps", "web");
  return {
    appRoot,
    projectRoot,
    hostApp: false,
    viteConfigPath: findViteConfig(appRoot) ?? path.join(appRoot, "vite.config.ts"),
  };
}

export { resolveAppLocation };
export type { AppLocation };
