/**
 * Reader sign-in for a vault: `plugins: [auth({ providers: { github: { … } } })]` in `svartz.config.ts`.
 * Server plugins read who is signed in with `readIdentity` from `@svartz/auth/server`.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, getCompilerContributions, type ResolvedConfig, type NormalizedSvartzPlugin, type SiteVaults, type SvartzPlugin } from "@svartz/core";
import type { SignInConfig } from "./browser";
import { isProviderId, PROVIDERS, type ProviderId } from "./providers";
import type { AuthOptions, AuthServerOptions } from "./server";

export type { Identity, ProviderId } from "./providers";
export type { AuthOptions, ProviderOptions } from "./server";
export type { SignInConfig } from "./browser";

/** The plugin id, and so the path segment its routes answer under: `<mount>/_svartz/auth/`. */
export const AUTH_PLUGIN_ID = "auth";

// Beside this module in dist.
const SERVER_MODULE = fileURLToPath(new URL("./server.js", import.meta.url));
const BROWSER_MODULE = fileURLToPath(new URL("./browser.js", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("./browser.css", import.meta.url));

function fail(message: string): never {
  throw new Error(`[svartz:auth] ${message}`);
}

/** Refuse config the routes could never serve, so a typo fails the build instead of every sign-in. */
function validate(options: AuthOptions): ProviderId[] {
  const names = Object.keys(options?.providers ?? {});
  if (names.length === 0) fail("list at least one provider under `providers`");
  for (const name of names) {
    if (!isProviderId(name)) fail(`unknown provider "${name}"; choose from ${Object.keys(PROVIDERS).join(", ")}`);
    const app = options.providers[name];
    if (typeof app?.clientId !== "string" || !app.clientId) fail(`providers.${name}.clientId must be the OAuth app's client ID`);
    if (typeof app.clientSecret?.env !== "string" || !app.clientSecret.env.trim()) {
      fail(`providers.${name}.clientSecret must name its environment variable: { env: "NAME" }`);
    }
  }
  if (options.privacyNotice !== undefined && typeof options.privacyNotice !== "string") {
    fail("privacyNotice must be the URL of the site's privacy notice");
  }
  if (options.callbackVault !== undefined && (typeof options.callbackVault !== "string" || !options.callbackVault)) {
    fail("callbackVault must be the id of the vault whose routes run sign-in");
  }
  return names as ProviderId[];
}

/**
 * The deployment base standalone shells give SvelteKit (`target.basePath` for `static` and `node`), so the browser
 * can reach the routes. A host app's `paths.base` isn't known here, so host vaults assume none.
 */
function deploymentBase(config: ResolvedConfig): string {
  const { target } = config;
  const base = (target.type === "static" || target.type === "node") && typeof target.basePath === "string" ? target.basePath : "";
  return base.replace(/\/+$/, "");
}

/** The `auth` options a vault runs, or `undefined` when it doesn't enable auth. */
function authOptionsOf(vault: ResolvedConfig): AuthOptions | undefined {
  const plugin = (vault.plugins as readonly SvartzPlugin[]).find(({ id }) => id === AUTH_PLUGIN_ID);
  const options = plugin?.server?.options as Partial<AuthOptions> | undefined;
  return options?.providers ? options as AuthOptions : undefined;
}

/**
 * The vault whose routes run every sign-in for `vault`: `callbackVault`, else the first host vault with auth.
 * Host vaults share one app, so they share one callback URL per provider. A standalone vault is its own app and
 * runs its own sign-in.
 */
function callbackVaultFor(options: AuthOptions, providers: readonly ProviderId[], { vault, vaults }: SiteVaults): ResolvedConfig {
  const named = options.callbackVault;
  if (vault.target.type !== "host") {
    if (named === undefined || named === vault.id) return vault;
    fail(`vault "${vault.id}" sets callbackVault "${named}", but only host vaults share a sign-in; "${vault.id}" runs its own`);
  }
  const host = vaults.filter((candidate) => candidate.target.type === "host" && authOptionsOf(candidate));
  const id = named ?? host[0]!.id;
  const target = vaults.find((candidate) => candidate.id === id);
  if (!target) fail(`vault "${vault.id}" sets callbackVault "${id}", but no vault has that id`);
  const targetOptions = target.target.type === "host" ? authOptionsOf(target) : undefined;
  if (!targetOptions) fail(`vault "${vault.id}" sets callbackVault "${id}", which must be a host vault that enables auth`);
  const missing = providers.find((provider) => !targetOptions.providers[provider]);
  if (missing) fail(`vault "${vault.id}" offers ${missing}, but its callbackVault "${id}" doesn't list it under providers`);
  return target;
}

/** The plugin one vault runs; `callbackMountPath` is set when another vault runs its sign-ins. */
function authPlugin(options: AuthOptions, providers: readonly ProviderId[], callbackMountPath?: string): NormalizedSvartzPlugin {
  const serverOptions: AuthServerOptions = callbackMountPath === undefined ? options : { ...options, callbackMountPath };
  return definePlugin(() => ({
    id: AUTH_PLUGIN_ID,
    server: { module: SERVER_MODULE, options: serverOptions },
    forVault(site) {
      const target = callbackVaultFor(options, providers, site);
      return target.id === site.vault.id ? authPlugin(options, providers) : authPlugin(options, providers, target.mountPath);
    },
    emitArtifacts: {
      run(ctx) {
        const browser: SignInConfig = {
          endpoint: `${deploymentBase(ctx.config)}${callbackMountPath ?? ctx.config.mountPath}/_svartz/${AUTH_PLUGIN_ID}`,
          providers: providers.map((id) => ({ id, label: PROVIDERS[id].label })),
          ...options.privacyNotice ? { privacyNotice: options.privacyNotice } : {},
        };
        const compiler = getCompilerContributions(ctx);
        compiler.browserResources.set(AUTH_PLUGIN_ID, { id: AUTH_PLUGIN_ID, kind: "script", importId: BROWSER_MODULE, options: browser });
        compiler.browserResources.set(`${AUTH_PLUGIN_ID}-css`, { id: `${AUTH_PLUGIN_ID}-css`, kind: "css", importId: STYLESHEET });
      },
      options: { fatal: true },
    },
  }))();
}

/** The `auth` plugin: sign-in routes on the server and the sign-in dialog in the browser. */
export function auth(options: AuthOptions): NormalizedSvartzPlugin {
  return authPlugin(options, validate(options));
}
