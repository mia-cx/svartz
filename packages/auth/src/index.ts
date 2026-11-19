/**
 * Reader sign-in for a vault: `plugins: [auth({ providers: { github: { … } } })]` in `svartz.config.ts`.
 * Server plugins read who is signed in with `readAccount` from `@svartz/auth/server`.
 */
import { fileURLToPath } from "node:url";
import {
  definePlugin, getCompilerContributions, type NormalizedSvartzPlugin, type PermissionDeclaration, type PluginContext, type ResolvedConfig,
  type SiteVaults, type SvartzPlugin,
} from "@svartz/core";
import type { SignInConfig } from "./browser";
import { assertSharedCatalogue, collectPermissions } from "./catalogue";
import { userPageHandle } from "./permissions";
import { isProviderId, PROVIDERS, type ProviderId } from "./providers";
import type { AuthOptions, AuthServerData, AuthServerOptions } from "./server";
import { DEFAULT_USER_PAGE_FOLDER } from "./user-pages";

/** The extensions of notes, which are pages; anything else a vault publishes is an attachment. */
const NOTE_EXTENSIONS = new Set([".md", ".mdx", ".svx"]);

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

/**
 * A folder as page slugs spell it: lowercase segments of letters, digits, `-` and `_`, starting with a letter or digit.
 * Slugs collapse a run of hyphens into one, so no segment has two in a row.
 */
const USER_PAGE_FOLDER = /^[a-z0-9](?:[a-z0-9_]|-(?!-))*(?:\/[a-z0-9](?:[a-z0-9_]|-(?!-))*)*$/;

/**
 * The folder of user pages, without a trailing slash. Refused when pages outside one folder could match it: empty, a
 * leading slash, dot segments, or any spelling a page's slug never has.
 */
function userPageFolderOf({ userPages = DEFAULT_USER_PAGE_FOLDER }: AuthOptions): string {
  const folder = typeof userPages === "string" ? userPages.replace(/\/$/, "") : "";
  if (!USER_PAGE_FOLDER.test(folder)) {
    fail(`userPages must be a folder of the vault, such as "users": lowercase letters, numbers, hyphens and underscores, with / between folders; ${JSON.stringify(userPages)} isn't`);
  }
  return folder;
}

/** The user pages a build holds, `<folder>/<handle>`, by handle, mapped to their URL; `null` for a hidden page. */
function userPagesOf(ctx: PluginContext, folder: string): Record<string, string | null> {
  const hrefs = new Map((ctx.index?.entries ?? []).map(({ slug, href }) => [slug, href]));
  const pages: Record<string, string | null> = {};
  for (const file of ctx.files) {
    if (!NOTE_EXTENSIONS.has(file.extension ?? "")) continue;
    // As the resolver reads a page object, so the build and the override agree on which pages are user pages.
    const handle = userPageHandle(`page:${ctx.config.id}/${file.slug}`, folder);
    if (handle !== undefined) pages[handle] = file.protection?.hidden ? null : hrefs.get(file.slug) ?? null;
  }
  return pages;
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
  const otherFolder = host.find((candidate) => authOptionsOf(candidate)!.userPages !== options.userPages);
  if (otherFolder) {
    fail(`vault "${vault.id}" keeps user pages in another folder than vault "${otherFolder.id}"; host vaults share accounts, so set the same userPages on each`);
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
function permissionsFor(site: SiteVaults): PermissionDeclaration[] {
  return collectPermissions(sharingVaults(site));
}

/** The vaults that share `vault`'s accounts: itself, or every host vault with auth, since they share one app. */
function sharingVaults({ vault, vaults }: SiteVaults): ResolvedConfig[] {
  if (vault.target.type !== "host") return [vault];
  return vaults.filter((candidate) => candidate.target.type === "host" && authOptionsOf(candidate));
}

/** The vault's published pages by slug, and every folder that holds one, ending in `/`. */
function pathsOf(slugs: readonly string[]): string[] {
  const folders = slugs.flatMap((slug) => slug.split("/").slice(0, -1).map((_, index, parts) => `${parts.slice(0, index + 1).join("/")}/`));
  return [...new Set([...folders, ...slugs])].sort();
}

/** What `forVault` resolved for one vault: where its sign-ins run, the catalogue, and the vaults sharing its accounts. */
interface Resolved {
  readonly callbackMountPath?: string;
  readonly permissions: readonly PermissionDeclaration[];
  readonly vaults: readonly string[];
}

/** The plugin one vault runs; `resolved` is set once every vault is known. */
function authPlugin(options: AuthOptions, providers: readonly ProviderId[], resolved?: Resolved): NormalizedSvartzPlugin {
  const serverOptions: AuthServerOptions = { ...options, ...resolved };
  const callbackMountPath = resolved?.callbackMountPath;
  return definePlugin(() => ({
    id: AUTH_PLUGIN_ID,
    // Eager, so every plugin that reads accounts or checks permissions sees this deployment's `admins` and catalogue
    // from its first request on.
    server: { module: SERVER_MODULE, options: serverOptions, eager: true, pages: ["account", "dashboard"] },
    forVault(site) {
      const target = callbackVaultFor(options, providers, site);
      return authPlugin(options, providers, {
        ...target.id !== site.vault.id && { callbackMountPath: target.mountPath },
        permissions: permissionsFor(site),
        vaults: sharingVaults(site).map(({ id }) => id),
      });
    },
    emitArtifacts: {
      run(ctx) {
        const browser: SignInConfig = {
          // Below the deployment base, which the dialog adds when it mounts.
          endpoint: `${callbackMountPath ?? ctx.config.mountPath}/_svartz/${AUTH_PLUGIN_ID}`,
          mountPath: ctx.config.mountPath,
          providers: providers.map((id) => ({ id, label: PROVIDERS[id].label })),
          ...options.privacyNotice ? { privacyNotice: options.privacyNotice } : {},
        };
        const compiler = getCompilerContributions(ctx);
        compiler.browserResources.set(AUTH_PLUGIN_ID, { id: AUTH_PLUGIN_ID, kind: "script", importId: BROWSER_MODULE, options: browser });
        compiler.browserResources.set(`${AUTH_PLUGIN_ID}-css`, { id: `${AUTH_PLUGIN_ID}-css`, kind: "css", importId: STYLESHEET });
        // The build's final plugins, which config resolution couldn't see whole: a theme preset's plugins, and what
        // other plugins' `forVault` returned. Checked like the catalogue, and added to it when the server starts.
        const built: AuthServerData = {
          permissions: collectPermissions([{ id: ctx.config.id, plugins: ctx.plugins ?? ctx.config.plugins }]),
          paths: pathsOf(ctx.index?.entries.map(({ slug }) => slug) ?? []),
          userPages: userPagesOf(ctx, options.userPages ?? DEFAULT_USER_PAGE_FOLDER),
        };
        // The catalogue config resolution collected reaches every vault's server as well, so the build may add to it
        // but not contradict it, or which of the two a server read last would decide a default.
        const configured = new Map((resolved?.permissions ?? []).map((declaration) => [declaration.slug, declaration]));
        const changed = built.permissions.find((ours) => configured.has(ours.slug) && JSON.stringify(configured.get(ours.slug)) !== JSON.stringify(ours));
        if (changed) {
          fail(`vault "${ctx.config.id}" builds with "${changed.slug}" declared differently than the config's plugins declare it; a theme preset or a forVault can add permissions, not change them`);
        }
        if (ctx.config.target.type === "host") assertSharedCatalogue(ctx.config.id, built.permissions);
        compiler.serverData.set(AUTH_PLUGIN_ID, built);
      },
      options: { fatal: true },
    },
  }))();
}

/** The `auth` plugin: sign-in routes on the server and the sign-in dialog in the browser. */
export function auth(options: AuthOptions): NormalizedSvartzPlugin {
  const providers = validate(options);
  return authPlugin({ ...options, userPages: userPageFolderOf(options) }, providers);
}
