import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "@svartz/config";
import { getVaultBuildRoot } from "@svartz/vite";

/** Where SvelteKit's adapter writes the Worker and its static files, relative to the vault's build root. */
const CLOUDFLARE_OUTPUT = ".svelte-kit/cloudflare";

/** The Wrangler settings a vault's Worker starts from. Its `cloudflare-workers` target overrides any of them. */
const WORKER_DEFAULTS = {
  compatibility_date: "2026-03-03",
  compatibility_flags: ["nodejs_compat", "nodejs_als"],
  observability: { enabled: true },
} as const;

/** Wrangler settings the build owns, because they point at its own output. */
interface BuildOwned {
  readonly main?: unknown;
  readonly assets?: object;
}

/**
 * The build's `main` and assets over one level of the target (the top level or an `env`), keeping the target's other
 * asset settings. Wrangler replaces the top-level `assets` with an environment's, so each level needs its own.
 */
function withBuildOutput<T extends BuildOwned>(vaultId: string, settings: T): T {
  if (settings.main !== undefined) {
    throw new Error(`Vault "${vaultId}" sets main in its target, but the build writes the Worker. Remove it.`);
  }
  return {
    ...settings,
    main: `${CLOUDFLARE_OUTPUT}/_worker.js`,
    // Markdown negotiation reads the `ASSETS` binding, and the Worker answers first so it can.
    assets: { ...settings.assets, binding: "ASSETS", run_worker_first: true, directory: CLOUDFLARE_OUTPUT },
  };
}

/**
 * The Wrangler config a `cloudflare-workers` vault builds and deploys with: the target's settings (routes, bindings,
 * vars, environments and the rest) over {@link WORKER_DEFAULTS}, with the Worker named after the vault unless the
 * target names it. The build owns `main` and the assets directory in every environment.
 */
function vaultWranglerConfig(vault: ResolvedConfig): Record<string, unknown> {
  if (vault.target.type !== "cloudflare-workers") throw new Error(`Vault "${vault.id}" doesn't deploy to Cloudflare Workers.`);
  const { type: _type, env, ...settings } = vault.target;
  const config: Record<string, unknown> = { name: vault.id, ...WORKER_DEFAULTS, ...withBuildOutput(vault.id, settings) };
  if (!env) return config;
  return {
    ...config,
    env: Object.fromEntries(Object.entries(env).map(([name, overrides]) => [
      name,
      overrides.assets || overrides.main !== undefined ? withBuildOutput(vault.id, overrides) : overrides,
    ])),
  };
}

/**
 * Write the vault's Wrangler config into its build root and answer its path. Relative paths in the config resolve from
 * there, so `main` and the assets directory share one real directory with SvelteKit's output. `svartz dev` reads the
 * project's `.dev.vars` itself, so no secrets land beside it.
 */
async function writeVaultWranglerConfig(vault: ResolvedConfig): Promise<string> {
  const file = path.join(getVaultBuildRoot(vault), "wrangler.json");
  await writeFile(file, `${JSON.stringify(vaultWranglerConfig(vault), null, 2)}\n`);
  return file;
}

export { vaultWranglerConfig, writeVaultWranglerConfig };
