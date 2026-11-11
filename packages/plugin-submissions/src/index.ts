/**
 * `@svartz/plugin-submissions`: readers edit a published note from the site and the site opens a pull request.
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
}

const DEFAULT_TOKEN: EnvReference = { env: "SVARTZ_GITHUB_TOKEN" };
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

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
    throw new Error(`[submissions] vaultRoot "${value}" must be a folder inside the repository, such as "content".`);
  }
  return root === "." ? "" : root;
}

/** Let readers edit any published Markdown note and submit it as a pull request on `repo`. */
export function submissions(options: SubmissionsOptions) {
  if (!REPO_PATTERN.test(options.repo)) {
    throw new Error(`[submissions] repo "${options.repo}" must be "owner/name".`);
  }
  const vaultRoot = options.vaultRoot === undefined ? undefined : normalizeVaultRoot(options.vaultRoot);
  const serverOptions: ServerOptions = {
    repo: options.repo,
    ...(options.branch ? { branch: options.branch } : {}),
    labels: [...(options.labels ?? [])],
    token: options.token ?? DEFAULT_TOKEN,
  };

  return definePlugin(() => ({
    id: PLUGIN_ID,
    server: { module: SERVER_MODULE, options: serverOptions },
    emitArtifacts: {
      options: { fatal: true },
      async run(ctx) {
        const checkout = await readCheckout(resolve(ctx.config.path));
        const root = vaultRoot ?? checkout.vaultRoot;
        // Protected notes stay out: their source must not leave the repository through the site.
        const notes = (ctx.index?.entries ?? []).filter((entry) => !entry.locked && /\.md$/i.test(entry.path));
        const pages: Record<string, string> = Object.fromEntries(notes.map((entry) => {
          const path = entry.path.replaceAll("\\", "/");
          return [entry.href, root ? `${root}/${path}` : path];
        }));

        const compiler = getCompilerContributions(ctx);
        compiler.serverData.set(PLUGIN_ID, { commit: checkout.commit, pages } satisfies BuildData);
        compiler.browserResources.set(PLUGIN_ID, {
          id: PLUGIN_ID,
          kind: "script",
          importId: BROWSER_SCRIPT,
          options: { endpoint: `${ctx.config.mountPath}/_svartz/${PLUGIN_ID}`, pages: Object.keys(pages) } satisfies BrowserOptions,
        });
        compiler.browserResources.set(`${PLUGIN_ID}:css`, { id: `${PLUGIN_ID}:css`, kind: "css", importId: STYLESHEET });
      },
    },
  }))();
}

export type { BrowserOptions, EditRequest, EditResponse, ErrorResponse, SourceResponse } from "./api";
