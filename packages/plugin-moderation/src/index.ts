/**
 * Readers report pages, edits, comments and accounts, and moderators work through the reports on the dashboard:
 * `plugins: [auth({ … }), moderation()]` in `svartz.config.ts`. Reports are kept in auth's accounts database,
 * `SVARTZ_DB`.
 *
 * The browser script adds **Report** beside a note's other page actions and answers every button marked
 * `data-svartz-report="<kind>:<id>"`, as annotations marks its comment cards. The build tells the server which pages the
 * vault publishes and which of the plugins that own other targets (annotations, submissions) it has; a target whose
 * plugin is absent can't be reported.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, getCompilerContributions, type NormalizedSvartzPlugin, type SvartzPlugin } from "@svartz/core";
import { PLUGIN_ID, type BrowserOptions } from "./api";
import { PERMISSIONS } from "./permissions";
import type { BuildData, ModerationOptions, ModerationServerOptions } from "./server";

export type { ModerationOptions } from "./server";
export type { ReportRequest, TargetKind } from "./api";
export { PLUGIN_ID as MODERATION_PLUGIN_ID, REASON_MAX_LENGTH, TARGET_KINDS } from "./api";

/** Reports each signed-in reader may send per hour unless `limits.reportsPerHour` says otherwise. */
export const DEFAULT_REPORTS_PER_HOUR = 10;

/** The folder user pages live in unless auth's `userPages` names another. */
const DEFAULT_USER_PAGES = "users";

// Beside this module in dist.
const SERVER_MODULE = fileURLToPath(new URL("./server.js", import.meta.url));
const BROWSER_MODULE = fileURLToPath(new URL("./browser.js", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("./browser.css", import.meta.url));

function fail(message: string): never {
  throw new Error(`[svartz:moderation] ${message}`);
}

/** Refuse config the routes could never serve, so a typo fails the build instead of every request. */
function resolve(options: ModerationOptions): ModerationServerOptions {
  const reportsPerHour = options.limits?.reportsPerHour ?? DEFAULT_REPORTS_PER_HOUR;
  if (!Number.isSafeInteger(reportsPerHour) || reportsPerHour < 1) fail("limits.reportsPerHour must be a whole number above 0");
  return { limits: { reportsPerHour } };
}

/** Reports need accounts, which need auth, and D1, which a node target lacks. */
function checkVault(vault: { readonly id: string; readonly target: { readonly type: string }; readonly plugins: readonly unknown[] }): void {
  if (vault.target.type === "node") {
    fail(`vault "${vault.id}" deploys to node, but reports are stored in Cloudflare D1; deploy it to cloudflare-workers or cloudflare-pages`);
  }
  const auth = (vault.plugins as readonly SvartzPlugin[]).find(({ id }) => id === "auth");
  if (!auth?.server || auth.disabled) fail(`vault "${vault.id}" enables moderation without auth; add auth({ providers: … }) to the same vault`);
}

/** A server plugin the build runs for this vault, by id, with its server options. */
function serverOptionsOf(plugins: readonly SvartzPlugin[] | undefined, id: string): Record<string, unknown> | undefined {
  const server = plugins?.find((plugin) => plugin.id === id)?.server;
  return server ? (server.options ?? {}) as Record<string, unknown> : undefined;
}

/** The `moderation` plugin: its routes and Reports panel on the server, and the Report action in the browser. */
export function moderation(options: ModerationOptions = {}): NormalizedSvartzPlugin {
  const serverOptions = resolve(options);
  const plugin: NormalizedSvartzPlugin = definePlugin(() => ({
    id: PLUGIN_ID,
    server: { module: SERVER_MODULE, options: serverOptions },
    permissions: PERMISSIONS,
    forVault({ vault }) {
      checkVault(vault);
      return plugin;
    },
    emitArtifacts: {
      // After submissions', whose build data says where in the repository the vault is.
      options: { fatal: true, enforce: "post" },
      run(ctx) {
        // Protected notes stay out: reporting one would tell moderators it exists.
        const published = (ctx.index?.entries ?? []).filter((entry) => !entry.locked);
        const pages = Object.fromEntries(published.map((entry) => [entry.slug, { title: entry.title, href: entry.href }]));
        // History has a page for each published Markdown note, where a reported commit can be reverted.
        const history = serverOptionsOf(ctx.plugins, "history") && {
          paths: Object.fromEntries(published.flatMap((entry) => {
            const path = entry.path.replaceAll("\\", "/");
            return /\.md$/i.test(path) ? [[path, entry.slug] as const] : [];
          })),
        };
        const annotations = serverOptionsOf(ctx.plugins, "annotations")?.database as { env?: unknown } | undefined;
        const submissions = serverOptionsOf(ctx.plugins, "submissions");
        const configured = serverOptionsOf(ctx.plugins, "auth")?.userPages;
        const userPages = typeof configured === "string" ? configured : DEFAULT_USER_PAGES;
        const compiler = getCompilerContributions(ctx);
        // Sync records the vault's saves, which say which pull requests are the vault's to close.
        const records = (submissions?.sync as { database?: { env?: unknown } } | undefined)?.database?.env;
        const root = (compiler.serverData.get("submissions") as { vaultRoot?: unknown } | undefined)?.vaultRoot;
        const data: BuildData = {
          pages,
          ...typeof annotations?.env === "string" && { annotations: { database: annotations.env } },
          ...typeof submissions?.repo === "string" && {
            submissions: { repo: submissions.repo, ...typeof records === "string" && typeof root === "string" && { records: { database: records, root } } },
          },
          ...history && { history },
        };
        compiler.serverData.set(PLUGIN_ID, data);
        compiler.browserResources.set(PLUGIN_ID, {
          id: PLUGIN_ID,
          kind: "script",
          importId: BROWSER_MODULE,
          options: { mountPath: ctx.config.mountPath ?? "", userPages } satisfies BrowserOptions,
        });
        compiler.browserResources.set(`${PLUGIN_ID}-css`, { id: `${PLUGIN_ID}-css`, kind: "css", importId: STYLESHEET });
      },
    },
  }))();
  return plugin;
}
