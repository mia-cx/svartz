import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEV_BINDINGS, type DevBindings } from "@svartz/core";

/** Wrangler's config file names, in the order Wrangler looks for them. */
const WRANGLER_CONFIG_FILES = ["wrangler.json", "wrangler.jsonc", "wrangler.toml"] as const;

interface PlatformProxy {
  readonly env: Readonly<Record<string, unknown>>;
  dispose(): Promise<void>;
}

/** The Wrangler settings that decide which local secrets a Worker sees. */
interface LocalVarsConfig {
  readonly vars: Record<string, unknown>;
  readonly secrets?: unknown;
}

interface Wrangler {
  getPlatformProxy(options: { configPath: string; environment?: string; persist: { path: string } }): Promise<PlatformProxy>;
  unstable_readConfig(args: { config: string; env?: string }, options: { hideWarnings: boolean }): LocalVarsConfig;
  /** Wrangler's own `.dev.vars` and `.env` loader. It reads the files beside `configPath`, which needn't exist. */
  unstable_getVarsForDev(
    configPath: string,
    envFiles: undefined,
    vars: LocalVarsConfig["vars"],
    env: string | undefined,
    silent: boolean,
    secrets: LocalVarsConfig["secrets"],
  ): Record<string, unknown>;
}

/**
 * The local secrets among what `unstable_getVarsForDev` loaded over `vars`. Before Wrangler 4.164 it answers
 * `{ ...vars, ...secrets }`, so a configured var comes back as the same value and each secret as a string; since, it
 * wraps every entry as `{ type, value }`. Configured vars are already on the platform env either way.
 */
function loadedSecrets(loaded: Record<string, unknown>, vars: LocalVarsConfig["vars"]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(loaded)
    .filter(([name, binding]) => binding !== vars[name])
    .map(([name, binding]) => [name, typeof binding === "string" ? binding : (binding as { value: unknown }).value]));
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

/**
 * Wrangler's platform for the config at `configPath`. Wrangler reads local secrets (`.dev.vars`, `.env`) beside its
 * config, so for a config outside `projectRoot`, such as the one a build generates, its loader runs again from the
 * project, where they live. Copying them beside the config instead would put secrets into the build. They load first,
 * so a failure leaves no proxy running.
 */
async function startPlatform(
  wrangler: Wrangler,
  configPath: string,
  projectRoot: string,
  environment: string | undefined,
  persistPath: string,
): Promise<PlatformProxy> {
  const start = () => wrangler.getPlatformProxy({ configPath, environment, persist: { path: persistPath } });
  if (resolve(configPath, "..") === resolve(projectRoot)) return await start();
  const { vars, secrets } = wrangler.unstable_readConfig({ config: configPath, env: environment }, { hideWarnings: true });
  const local = wrangler.unstable_getVarsForDev(join(projectRoot, "wrangler.json"), undefined, vars, environment, true, secrets);
  const platform = await start();
  return {
    env: { ...platform.env, ...loadedSecrets(local, vars) },
    dispose: () => platform.dispose(),
  };
}

interface DevBindingsOptions {
  /** Read the Wrangler config's bindings: the app deploys to Cloudflare. */
  readonly wrangler?: boolean;
  /** `.env` values the platform env lacks, which Wrangler's bindings override. */
  readonly dotenv?: Readonly<Record<string, string>>;
}

/**
 * Hand server plugins `dotenv`, and the bindings, vars and local secrets of the Wrangler config in `configDir`, under
 * `svartz dev`. Wrangler resolves from `projectRoot`, and the secrets come from there. Its `getPlatformProxy` starts on
 * the first plugin request and keeps local data in `.wrangler/state` beside that config, where
 * `wrangler d1 execute --local` reads it. Does nothing without either. Returns a function that stops the proxy.
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
      proxy = importWrangler(projectRoot).then((wrangler) =>
        startPlatform(wrangler, configPath, projectRoot, environment, persistPath));
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
