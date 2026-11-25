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
  getPlatformProxy(options: {
    configPath: string;
    environment?: string;
    envFiles: string[];
    persist: { path: string };
  }): Promise<PlatformProxy>;
}

/**
 * The local secret files Wrangler would pick beside its config, read from `projectRoot` instead: `.dev.vars.<env>` or
 * `.dev.vars`, else the `.env` files. A generated config never sits beside them, and copying them there would put
 * secrets into the build.
 */
function localSecretFiles(projectRoot: string, environment: string | undefined): string[] {
  const devVars = [...(environment ? [`.dev.vars.${environment}`] : []), ".dev.vars"]
    .map((name) => join(projectRoot, name))
    .find(existsSync);
  if (devVars) return [devVars];
  const suffixes = ["", ...(environment ? [`.${environment}`] : [])];
  return suffixes.flatMap((suffix) => [`.env${suffix}`, `.env${suffix}.local`]).map((name) => join(projectRoot, name));
}

type BindingsSlot = { [DEV_BINDINGS]?: DevBindings };

async function importWrangler(appRoot: string): Promise<Wrangler> {
  let entry: string;
  try {
    entry = createRequire(join(appRoot, "package.json")).resolve("wrangler");
  } catch (cause) {
    throw new Error(`[svartz:dev] Server plugins read local Cloudflare bindings through Wrangler. Install wrangler in the project (it resolves from ${appRoot}).`, { cause });
  }
  return await import(pathToFileURL(entry).href) as Wrangler;
}

interface DevBindingsOptions {
  /** Read the Wrangler config's bindings: the app deploys to Cloudflare. */
  readonly wrangler?: boolean;
  /** `.env` values the platform env lacks, which Wrangler's bindings override. */
  readonly dotenv?: Readonly<Record<string, string>>;
}

/**
 * Hand server plugins `dotenv`, and the bindings and vars of the Wrangler config in `configDir` with the project's
 * `.dev.vars`, under `svartz dev`. Wrangler resolves from `projectRoot`. Its `getPlatformProxy` starts on the first
 * plugin request and keeps local data in `.wrangler/state` beside that config, where `wrangler d1 execute --local`
 * reads it. Does nothing without either. Returns a function that stops the proxy.
 */
export function serveDevBindings(
  configDir: string,
  projectRoot: string,
  { wrangler = true, dotenv = {} }: DevBindingsOptions = {},
): () => Promise<void> {
  const configPath = wrangler ? WRANGLER_CONFIG_FILES.map((name) => join(configDir, name)).find(existsSync) : undefined;
  if (!configPath && Object.keys(dotenv).length === 0) return async () => {};
  // getPlatformProxy's default persistence follows the working directory, which the CLI moves to the app root;
  // `wrangler d1 execute --local` reads from beside the config.
  const persistPath = join(configDir, ".wrangler", "state", "v3");

  let proxy: Promise<PlatformProxy> | undefined;
  const bindings: DevBindings = async () => {
    if (!configPath) return dotenv;
    if (!proxy) {
      // CLOUDFLARE_ENV is how Wrangler selects an environment; a host that picks one in its adapter options sets it
      // here too, or plugins read the top-level bindings.
      const environment = process.env.CLOUDFLARE_ENV || undefined;
      const envFiles = localSecretFiles(projectRoot, environment);
      proxy = importWrangler(projectRoot).then((wrangler) =>
        wrangler.getPlatformProxy({ configPath, environment, envFiles, persist: { path: persistPath } }));
      // A failed start (a bad config, a missing Wrangler) retries on the next request rather than sticking.
      proxy.catch(() => { proxy = undefined; });
    }
    return { ...dotenv, ...(await proxy).env };
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
