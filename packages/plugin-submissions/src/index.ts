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
import { definePlugin, getCompilerContributions, type EnvReference } from "@svartz/core";
import { PLUGIN_ID, type BrowserOptions } from "./api";
import type { GuardOptions, RateLimitOptions, TurnstileOptions } from "./guard";
import type { BuildData, ServerOptions } from "./server";

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
   * repository's Contents and Pull requests. Default: `{ env: "SVARTZ_GITHUB_TOKEN" }`.
   */
  readonly token?: EnvReference;
  /** What every submission must pass before it reaches GitHub. */
  readonly guard?: {
    /** Show a Cloudflare Turnstile challenge in the editor and verify its token on the server. */
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
function guardOptions(guard: SubmissionsOptions["guard"] = {}): GuardOptions {
  const { turnstile, rateLimit = DEFAULT_RATE_LIMIT } = guard;
  if (turnstile) {
    if (isBlank(turnstile.siteKey)) fail("guard.turnstile.siteKey must be the widget's site key");
    if (isBlank(turnstile.secret?.env)) fail('guard.turnstile.secret must name its environment variable: { env: "NAME" }');
  }
  if (!isPositiveInteger(rateLimit.limit) || !isPositiveInteger(rateLimit.period)) {
    fail("guard.rateLimit needs a whole number of submissions (limit) per whole number of seconds (period)");
  }
  return {
    ...(turnstile ? { turnstile: { siteKey: turnstile.siteKey, secret: { env: turnstile.secret.env } } } : {}),
    rateLimit: { limit: rateLimit.limit, period: rateLimit.period },
  };
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

/** Let readers edit any published Markdown note, or add one in a published folder, as a pull request on `repo`. */
export function submissions(options: SubmissionsOptions) {
  if (!REPO_PATTERN.test(options.repo)) fail(`repo "${options.repo}" must be "owner/name".`);
  if (options.token && isBlank(options.token.env)) fail('token must name its environment variable: { env: "NAME" }');
  const guard = guardOptions(options.guard);
  const vaultRoot = options.vaultRoot === undefined ? undefined : normalizeVaultRoot(options.vaultRoot);
  const serverOptions: ServerOptions = {
    repo: options.repo,
    ...(options.branch ? { branch: options.branch } : {}),
    labels: [...(options.labels ?? [])],
    token: options.token ?? DEFAULT_TOKEN,
    guard,
  };

  return definePlugin(() => ({
    id: PLUGIN_ID,
    server: { module: SERVER_MODULE, options: serverOptions },
    emitArtifacts: {
      options: { fatal: true },
      async run(ctx) {
        const checkout = await readCheckout(resolve(ctx.config.path));
        const root = vaultRoot ?? checkout.vaultRoot;
        const entries = ctx.index?.entries ?? [];
        const routes: Record<string, string> = Object.fromEntries(entries.map(({ href, path }) =>
          [path.replaceAll("\\", "/").replace(/\.[^./]+$/, "").toLowerCase(), href]));
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
}

export type { BrowserOptions, EditRequest, EditResponse, ErrorResponse, NewPageRequest, SourceResponse } from "./api";
export type { RateLimitOptions, TurnstileOptions } from "./guard";
