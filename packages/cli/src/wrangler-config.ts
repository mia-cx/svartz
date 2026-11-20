import { existsSync } from "node:fs";
import { copyFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "@svartz/config";
import { getVaultBuildRoot } from "@svartz/vite";

/** Where SvelteKit's adapter writes the Worker and its static files, relative to the vault's build root. */
const CLOUDFLARE_OUTPUT = ".svelte-kit/cloudflare";

/** Local secrets for `svartz dev`, which Wrangler reads only from beside its config. */
const DEV_VARS = ".dev.vars";

/** The Wrangler settings a vault's Worker starts from. Its `cloudflare-workers` target overrides any of them. */
const WORKER_DEFAULTS = {
  compatibility_date: "2026-03-03",
  compatibility_flags: ["nodejs_compat", "nodejs_als"],
  observability: { enabled: true },
} as const;

/**
 * The Wrangler config a `cloudflare-workers` vault builds and deploys with: the target's settings (routes, bindings,
 * vars and the rest) over {@link WORKER_DEFAULTS}, with the Worker named after the vault unless the target names it.
 * The build owns `main` and the assets directory, since they point at its own output.
 */
function vaultWranglerConfig(vault: ResolvedConfig): Record<string, unknown> {
  if (vault.target.type !== "cloudflare-workers") throw new Error(`Vault "${vault.id}" doesn't deploy to Cloudflare Workers.`);
  const { type: _type, main, assets, ...settings } = vault.target;
  if (main !== undefined) {
    throw new Error(`Vault "${vault.id}" sets target.main, but the build writes the Worker. Remove it.`);
  }
  return {
    name: vault.id,
    ...WORKER_DEFAULTS,
    ...settings,
    main: `${CLOUDFLARE_OUTPUT}/_worker.js`,
    // Markdown negotiation reads the `ASSETS` binding, and the Worker answers first so it can.
    assets: Object.assign({}, assets, { binding: "ASSETS", run_worker_first: true, directory: CLOUDFLARE_OUTPUT }),
  };
}

/**
 * Write the vault's Wrangler config into its build root and answer its path, with the project's `.dev.vars` beside it.
 * Relative paths in the config resolve from there, so `main` and the assets directory share one real directory with
 * SvelteKit's output.
 */
async function writeVaultWranglerConfig(vault: ResolvedConfig, projectRoot: string): Promise<string> {
  const buildRoot = getVaultBuildRoot(vault);
  const file = path.join(buildRoot, "wrangler.json");
  await writeFile(file, `${JSON.stringify(vaultWranglerConfig(vault), null, 2)}\n`);
  const devVars = path.join(projectRoot, DEV_VARS);
  if (existsSync(devVars)) await copyFile(devVars, path.join(buildRoot, DEV_VARS));
  else await rm(path.join(buildRoot, DEV_VARS), { force: true });
  return file;
}

export { vaultWranglerConfig, writeVaultWranglerConfig };
