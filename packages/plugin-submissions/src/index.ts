/**
 * `@svartz/plugin-submissions`: readers edit a published note, or write a new one, from the site, and the site opens
 * a pull request.
 *
 * ```ts
 * plugins: [submissions({ repo: "wikiplace/wikiplace.live", labels: ["submission"] })]
 * ```
 *
 * The build records each editable note's repository path and the commit it built from, for the server only.
 * The vault needs a server target (`cloudflare-workers`, `cloudflare-pages` or `node`).
 */
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  definePlugin,
  getCompilerContributions,
  type EnvReference,
  type NormalizedSvartzPlugin,
  type ProcessedFile,
  type SvartzPlugin,
} from "@svartz/core";
import { isNote, pathRoute, requestedSlug, routeHref } from "@svartz/plugins/routes";
import { PLUGIN_ID, type BrowserOptions } from "./api";
import type { GuardOptions, RateLimitOptions, TurnstileOptions } from "./guard";
import type { BuildData, Credentials, ServerOptions } from "./server";

export interface SubmissionsOptions {
  /** The GitHub repository pull requests open on, as `owner/name`. */
  readonly repo: string;
  /** The branch pull requests target. Default: the repository's default branch. */
  readonly branch?: string;
  /** The vault folder's path inside the repository, such as `"content"`. Default: read from git. */
  readonly vaultRoot?: string;
  /** Labels every submission's pull request gets. */
  readonly labels?: readonly string[];
  /**
   * The server environment variable holding a fine-grained GitHub token with read and write access to the
   * repository's Contents and Pull requests. Default, unless `app` is set: `{ env: "SVARTZ_GITHUB_TOKEN" }`.
   */
  readonly token?: EnvReference;
  /** Open pull requests as a GitHub App, in place of `token`: they then come from `<app>[bot]`. */
  readonly app?: {
    /** The App's ID, or its Client ID. */
    readonly id: number | string;
    /** The server environment variable holding the App's private key, the `.pem` file GitHub generates. */
    readonly privateKey: EnvReference;
    /** The App's installation ID on `repo`. Default: looked up from the repository. */
    readonly installation?: number;
  };
  /** Reader sign-in, through the `auth` plugin on the same vault. */
  readonly signIn?: {
    /** Refuse submissions from readers who aren't signed in; the editor asks them to sign in. Default: `false`. */
    readonly required?: boolean;
  };
  /** What every submission must pass before it reaches GitHub. */
  readonly guard?: {
    /** Show a Cloudflare Turnstile challenge in the editor and verify its token on the server. Skipped when sign-in is required. */
    readonly turnstile?: TurnstileOptions;
    /** Submissions allowed per signed-in identity, or per IP when anonymous. Default: 10 an hour. */
    readonly rateLimit?: RateLimitOptions;
  };
}

const DEFAULT_TOKEN: EnvReference = { env: "SVARTZ_GITHUB_TOKEN" };
const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 10, period: 60 * 60 };
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function fail(message: string): never {
  throw new Error(`[submissions] ${message}`);
}

const isBlank = (value: unknown) => typeof value !== "string" || !value.trim();
const isPositiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) > 0;

/** Refuse guard config the server could never apply, so a typo fails the build instead of every submission. */
function guardOptions({ signIn = {}, guard = {} }: SubmissionsOptions): GuardOptions {
  const { turnstile, rateLimit = DEFAULT_RATE_LIMIT } = guard;
  const { required = false } = signIn;
  if (typeof required !== "boolean") fail("signIn.required must be true or false");
  if (turnstile) {
    if (isBlank(turnstile.siteKey)) fail("guard.turnstile.siteKey must be the widget's site key");
    if (isBlank(turnstile.secret?.env)) fail('guard.turnstile.secret must name its environment variable: { env: "NAME" }');
  }
  if (!isPositiveInteger(rateLimit.limit) || !isPositiveInteger(rateLimit.period)) {
    fail("guard.rateLimit needs a whole number of submissions (limit) per whole number of seconds (period)");
  }
  return {
    ...(required ? { signInRequired: true } : {}),
    // Signed-in readers skip the challenge, so a site that requires sign-in never shows it.
    ...(turnstile && !required ? { turnstile: { siteKey: turnstile.siteKey, secret: { env: turnstile.secret.env } } } : {}),
    rateLimit: { limit: rateLimit.limit, period: rateLimit.period },
  };
}

/** Required sign-in needs the `auth` plugin on the same vault, or no reader could ever submit. */
function checkVault(vault: { readonly id: string; readonly plugins: readonly unknown[] }): void {
  const auth = (vault.plugins as readonly SvartzPlugin[]).find(({ id }) => id === "auth");
  if (!auth?.server || auth.disabled) {
    fail(`vault "${vault.id}" requires sign-in for submissions without auth; add auth({ providers: … }) to the same vault`);
  }
}

// Beside this module in dist.
const SERVER_MODULE = fileURLToPath(new URL("./server.js", import.meta.url));
const BROWSER_SCRIPT = fileURLToPath(new URL("./browser.js", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("./browser.css", import.meta.url));

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", ["-C", cwd, ...args])).stdout.trim();
}

/** The commit the vault is built from, and the vault's folder inside its repository. */
async function readCheckout(vaultPath: string): Promise<{ commit: string; vaultRoot: string }> {
  try {
    const [top, commit] = await Promise.all([git(vaultPath, "rev-parse", "--show-toplevel"), git(vaultPath, "rev-parse", "HEAD")]);
    // Both sides resolved, so a symlinked checkout (macOS's /tmp) still yields a relative path.
    const vaultRoot = relative(await realpath(top), await realpath(vaultPath)).replaceAll("\\", "/");
    return { commit, vaultRoot };
  } catch (cause) {
    throw new Error(
      `[submissions] ${vaultPath} must be in a git checkout with at least one commit: edits branch from the commit the site is built from.`,
      { cause },
    );
  }
}

/** `"./content/"` → `"content"`; the repository root is `""`. */
function normalizeVaultRoot(value: string): string {
  const root = value.replaceAll("\\", "/").replace(/^(?:\.\/)+|^\/+|\/+$/g, "");
  if (isAbsolute(value) || root.split("/").includes("..")) {
    fail(`vaultRoot "${value}" must be a folder inside the repository, such as "content".`);
  }
  return root === "." ? "" : root;
}

/**
 * Every route a note holds or would ask for again, of any type and protected ones included, mapped to the page's
 * public URL, or `null` when the page is hidden. Read from the files rather than the index: the index redacts
 * protected notes' paths and leaves hidden ones out.
 */
function routeClaims(files: readonly ProcessedFile[], mountPath: string): Record<string, string | null> {
  const notes = files.filter(isNote);
  const link = (file: ProcessedFile) => file.protection?.hidden ? null : routeHref(file.slug, mountPath);
  // A note's own route first, so a key two notes ask for links the one holding it.
  const claims: Record<string, string | null> = Object.fromEntries(notes.map((file) => [file.slug, link(file)]));
  for (const file of notes) {
    for (const key of [requestedSlug(file), pathRoute(file.path)]) {
      if (!(key in claims)) claims[key] = link(file);
    }
  }
  return claims;
}

/** Exactly one kind of GitHub credentials, checked so a typo fails the build instead of every submission. */
function credentials({ token, app }: SubmissionsOptions): Credentials {
  if (token && app) fail("set either token or app, not both");
  if (!app) {
    if (token && isBlank(token.env)) fail('token must name its environment variable: { env: "NAME" }');
    return { token: { env: (token ?? DEFAULT_TOKEN).env } };
  }
  if (!isPositiveInteger(app.id) && isBlank(app.id)) fail("app.id must be the App's ID or Client ID");
  if (isBlank(app.privateKey?.env)) fail('app.privateKey must name its environment variable: { env: "NAME" }');
  if (app.installation !== undefined && !isPositiveInteger(app.installation)) {
    fail("app.installation must be the installation's numeric ID, or left out to look it up");
  }
  return {
    app: {
      id: app.id,
      privateKey: { env: app.privateKey.env },
      ...(app.installation === undefined ? {} : { installation: app.installation }),
    },
  };
}

/** Let readers edit any published Markdown note, or add one in a published folder, as a pull request on `repo`. */
export function submissions(options: SubmissionsOptions) {
  if (!REPO_PATTERN.test(options.repo)) fail(`repo "${options.repo}" must be "owner/name".`);
  const guard = guardOptions(options);
  const vaultRoot = options.vaultRoot === undefined ? undefined : normalizeVaultRoot(options.vaultRoot);
  const serverOptions: ServerOptions = {
    repo: options.repo,
    ...(options.branch ? { branch: options.branch } : {}),
    labels: [...(options.labels ?? [])],
    ...credentials(options),
    guard,
  };

  const plugin: NormalizedSvartzPlugin = definePlugin(() => ({
    id: PLUGIN_ID,
    server: { module: SERVER_MODULE, options: serverOptions },
    forVault({ vault }) {
      if (guard.signInRequired) checkVault(vault);
      return plugin;
    },
    emitArtifacts: {
      options: { fatal: true },
      async run(ctx) {
        const checkout = await readCheckout(resolve(ctx.config.path));
        const root = vaultRoot ?? checkout.vaultRoot;
        const entries = ctx.index?.entries ?? [];
        const routes = routeClaims(ctx.files, ctx.config.mountPath ?? "");
        // Protected notes stay out: their source must not leave the repository through the site.
        const published = entries
          .filter((entry) => !entry.locked)
          .map((entry) => ({ href: entry.href, path: entry.path.replaceAll("\\", "/") }));
        const pages: Record<string, string> = Object.fromEntries(published
          .filter(({ path }) => /\.md$/i.test(path))
          .map(({ href, path }) => [href, root ? `${root}/${path}` : path]));
        // New pages go only where a published note already is. Discovery skips hidden folders, so none are here.
        const folders = [...new Set(published.map(({ path }) => path.slice(0, Math.max(path.lastIndexOf("/"), 0))))]
          .sort((a, b) => a.localeCompare(b));

        const compiler = getCompilerContributions(ctx);
        compiler.serverData.set(PLUGIN_ID, { commit: checkout.commit, pages, routes, vaultRoot: root, folders } satisfies BuildData);
        compiler.browserResources.set(PLUGIN_ID, {
          id: PLUGIN_ID,
          kind: "script",
          importId: BROWSER_SCRIPT,
          options: {
            endpoint: `${ctx.config.mountPath}/_svartz/${PLUGIN_ID}`,
            pages: Object.keys(pages),
            folders,
            ...(guard.turnstile ? { turnstileSiteKey: guard.turnstile.siteKey } : {}),
          } satisfies BrowserOptions,
        });
        compiler.browserResources.set(`${PLUGIN_ID}:css`, { id: `${PLUGIN_ID}:css`, kind: "css", importId: STYLESHEET });
      },
    },
  }))();
  return plugin;
}

export type { BrowserOptions, EditRequest, EditResponse, ErrorResponse, NewPageRequest, SourceResponse } from "./api";
export type { RateLimitOptions, TurnstileOptions } from "./guard";
