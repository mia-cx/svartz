import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.cts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"] as const;

/** The app the `svartz` package ships: every vault whose target isn't `host` builds with it. */
const SHIPPED_APP_ROOT = fileURLToPath(new URL("../app/", import.meta.url));

interface AppLocation {
  readonly appRoot: string;
  readonly projectRoot: string;
  /** A SvelteKit app at the config root, which `host` vaults mount in. Otherwise the shipped app. */
  readonly hostApp: boolean;
  readonly viteConfigPath: string;
}

function findViteConfig(root: string): string | undefined {
  return VITE_CONFIG_FILES.map((name) => path.join(root, name)).find(existsSync);
}

/** The SvelteKit app at `configDir`, if there is one. */
function resolveHostApp(configDir: string): AppLocation | undefined {
  const projectRoot = path.resolve(configDir);
  const packageJsonPath = path.join(projectRoot, "package.json");
  const viteConfigPath = findViteConfig(projectRoot);
  if (!viteConfigPath || !existsSync(packageJsonPath)) return undefined;
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (!manifest.dependencies?.["@sveltejs/kit"] && !manifest.devDependencies?.["@sveltejs/kit"]) return undefined;
  return { appRoot: projectRoot, projectRoot, hostApp: true, viteConfigPath };
}

/** The shipped app, building vaults of the config at `configDir`. */
function shippedApp(configDir: string): AppLocation {
  return {
    appRoot: SHIPPED_APP_ROOT,
    projectRoot: path.resolve(configDir),
    hostApp: false,
    viteConfigPath: path.join(SHIPPED_APP_ROOT, "vite.config.js"),
  };
}

/** The host app at `configDir` when there is one, or else the shipped app. */
function resolveAppLocation(configDir: string): AppLocation {
  return resolveHostApp(configDir) ?? shippedApp(configDir);
}

export { resolveAppLocation, resolveHostApp, shippedApp, SHIPPED_APP_ROOT };
export type { AppLocation };
