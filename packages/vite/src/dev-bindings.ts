import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEV_BINDINGS, type DevBindings } from "@svartz/core";

/** Wrangler's config file names, in the order Wrangler looks for them. */
const WRANGLER_CONFIG_FILES = ["wrangler.json", "wrangler.jsonc", "wrangler.toml"] as const;

interface PlatformProxy {
  readonly env: Readonly<Record<string, unknown>>;
  dispose(): Promise<void>;
}

interface Wrangler {
  getPlatformProxy(options: { configPath: string; persist: { path: string } }): Promise<PlatformProxy>;
}

type BindingsSlot = { [DEV_BINDINGS]?: DevBindings };

async function importWrangler(appRoot: string): Promise<Wrangler> {
  let entry: string;
  try {
    entry = createRequire(join(appRoot, "package.json")).resolve("wrangler");
  } catch (cause) {
    throw new Error(`[svartz:dev] Server plugins read local Cloudflare bindings through Wrangler. Add wrangler to the devDependencies of ${appRoot}.`, { cause });
  }
  return await import(pathToFileURL(entry).href) as Wrangler;
}

/**
 * Hand server plugins the bindings, vars and `.dev.vars` of the Wrangler config in `configDir` under `svartz dev`.
 * Wrangler's `getPlatformProxy` starts on the first plugin request and keeps local data in `.wrangler/state` beside
 * that config, where `wrangler d1 execute --local` reads it. Does nothing without a Wrangler config.
 * Returns a function that stops the proxy.
 */
export function serveDevBindings(configDir: string, appRoot: string): () => Promise<void> {
  const configPath = WRANGLER_CONFIG_FILES.map((name) => join(configDir, name)).find(existsSync);
  if (!configPath) return async () => {};
  // getPlatformProxy's default persistence follows the working directory, which the CLI moves to the app root;
  // `wrangler d1 execute --local` reads from beside the config.
  const persistPath = join(configDir, ".wrangler", "state", "v3");

  let proxy: Promise<PlatformProxy> | undefined;
  const bindings: DevBindings = async () => {
    if (!proxy) {
      proxy = importWrangler(appRoot).then((wrangler) => wrangler.getPlatformProxy({ configPath, persist: { path: persistPath } }));
      // A failed start (a bad config, a missing Wrangler) retries on the next request rather than sticking.
      proxy.catch(() => { proxy = undefined; });
    }
    return (await proxy).env;
  };
  const slot = globalThis as BindingsSlot;
  slot[DEV_BINDINGS] = bindings;

  return async () => {
    if (slot[DEV_BINDINGS] === bindings) delete slot[DEV_BINDINGS];
    const started = await proxy?.catch(() => undefined);
    proxy = undefined;
    await started?.dispose();
  };
}
