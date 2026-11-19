/**
 * Reader sign-in for a vault: `plugins: [auth({ providers: { github: { … } } })]` in `svartz.config.ts`.
 * Server plugins read who is signed in with `readAccount` from `@svartz/auth/server`.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, getCompilerContributions, type PermissionDeclaration, type ResolvedConfig, type NormalizedSvartzPlugin, type SiteVaults, type SvartzPlugin } from "@svartz/core";
import type { SignInConfig } from "./browser";
import { assertSharedCatalogue, collectPermissions } from "./catalogue";
import { isProviderId, PROVIDERS, type ProviderId } from "./providers";
import type { AuthOptions, AuthServerData, AuthServerOptions } from "./server";

export type { Identity, ProviderId } from "./providers";
export type { Account, SignIn, SignedOutReason } from "./session";
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
  const admins = options.admins ?? [];
  if (!Array.isArray(admins)) fail("admins must be a list of identity ids such as \"github:583231\"");
  for (const admin of admins) {
    const [provider = "", id] = typeof admin === "string" ? admin.split(/:(.*)/s) : [];
    if (!id) fail(`admins lists ${JSON.stringify(admin)}; use identity ids such as "github:583231"`);
    // Only a provider readers can sign in with ever reaches the account.
    if (!names.includes(provider)) fail(`admins lists "${admin}", but providers doesn't offer ${provider}`);
  }
  return names as ProviderId[];
}

/** The same admins in any order: host vaults share accounts, so they must agree on who administers them. */
const sameAdmins = (a: readonly string[] = [], b: readonly string[] = []): boolean =>
  new Set(a).size === new Set(b).size && a.every((admin) => b.includes(admin));

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
  // Every host vault, not only the callback vault: vaults with separate callback vaults still share accounts.
  const differs = host.find((candidate) => !sameAdmins(options.admins, authOptionsOf(candidate)!.admins));
  if (differs) {
    fail(`vault "${vault.id}" lists different admins than vault "${differs.id}"; host vaults share accounts, so list the same admins on each`);
  }
  const id = named ?? host[0]!.id;
  const target = vaults.find((candidate) => candidate.id === id);
  if (!target) fail(`vault "${vault.id}" sets callbackVault "${id}", but no vault has that id`);
  const targetOptions = target.target.type === "host" ? authOptionsOf(target) : undefined;
  if (!targetOptions) fail(`vault "${vault.id}" sets callbackVault "${id}", which must be a host vault that enables auth`);
  const missing = providers.find((provider) => !targetOptions.providers[provider]);
  if (missing) fail(`vault "${vault.id}" offers ${missing}, but its callbackVault "${id}" doesn't list it under providers`);
  // The target forwards nothing itself, or sign-in could bounce between vaults forever (or hop through a chain).
  const targetOwner = targetOptions.callbackVault ?? host[0]!.id;
  if (targetOwner !== target.id) {
    fail(`vault "${vault.id}" sends sign-in to "${id}", but "${id}" sends its own to "${targetOwner}"; set the same callbackVault on every host vault`);
  }
  return target;
}

/**
 * The permissions every plugin sharing `vault`'s accounts declares: its own, or on a host vault, those of every host
 * vault with auth, since they share one app, one auth module and one grants table.
 */
function permissionsFor({ vault, vaults }: SiteVaults): PermissionDeclaration[] {
  if (vault.target.type !== "host") return collectPermissions([vault]);
  return collectPermissions(vaults.filter((candidate) => candidate.target.type === "host" && authOptionsOf(candidate)));
}

/**
 * The plugin one vault runs. `callbackMountPath` is set when another vault runs its sign-ins; `permissions` is the
 * catalogue, collected once every vault is known.
 */
function authPlugin(options: AuthOptions, providers: readonly ProviderId[], callbackMountPath?: string, permissions?: readonly PermissionDeclaration[]): NormalizedSvartzPlugin {
  const serverOptions: AuthServerOptions = {
    ...options,
    ...callbackMountPath !== undefined && { callbackMountPath },
    ...permissions !== undefined && { permissions },
  };
  return definePlugin(() => ({
    id: AUTH_PLUGIN_ID,
    // Eager, so every plugin that reads accounts or checks permissions sees this deployment's `admins` and catalogue
    // from its first request on.
    server: { module: SERVER_MODULE, options: serverOptions, eager: true },
    forVault(site) {
      const target = callbackVaultFor(options, providers, site);
      return authPlugin(options, providers, target.id === site.vault.id ? undefined : target.mountPath, permissionsFor(site));
    },
    emitArtifacts: {
      run(ctx) {
        const browser: SignInConfig = {
          // Below the deployment base, which the dialog adds when it mounts.
          endpoint: `${callbackMountPath ?? ctx.config.mountPath}/_svartz/${AUTH_PLUGIN_ID}`,
          providers: providers.map((id) => ({ id, label: PROVIDERS[id].label })),
          ...options.privacyNotice ? { privacyNotice: options.privacyNotice } : {},
        };
        const compiler = getCompilerContributions(ctx);
        compiler.browserResources.set(AUTH_PLUGIN_ID, { id: AUTH_PLUGIN_ID, kind: "script", importId: BROWSER_MODULE, options: browser });
        compiler.browserResources.set(`${AUTH_PLUGIN_ID}-css`, { id: `${AUTH_PLUGIN_ID}-css`, kind: "css", importId: STYLESHEET });
        // The build's final plugins, which config resolution couldn't see whole: a theme preset's plugins, and what
        // other plugins' `forVault` returned. Checked like the catalogue, and added to it when the server starts.
        const built: AuthServerData = { permissions: collectPermissions([{ id: ctx.config.id, plugins: ctx.plugins ?? ctx.config.plugins }]) };
        if (ctx.config.target.type === "host") assertSharedCatalogue(ctx.config.id, built.permissions);
        compiler.serverData.set(AUTH_PLUGIN_ID, built);
      },
      options: { fatal: true },
    },
  }))();
}

/** The `auth` plugin: sign-in routes on the server and the sign-in dialog in the browser. */
export function auth(options: AuthOptions): NormalizedSvartzPlugin {
  return authPlugin(options, validate(options));
}
