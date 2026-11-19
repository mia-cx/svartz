/**
 * `@svartz/plugin-history`: every published page's history with diffs, and Recent changes for the whole wiki, read
 * from the GitHub mirror the submissions plugin keeps.
 *
 * ```ts
 * plugins: [auth({ … }), submissions({ repo, app, sync: { … } }), history()]
 * ```
 *
 * The vault needs the submissions plugin with `sync` set, which makes it a Cloudflare vault. A History action joins
 * Edit beside every page with a history, and each account's user page lists its contributions below the note. Whoever
 * holds `history:reverts:write` on a page can revert it to an earlier revision from its history.
 */
import { fileURLToPath } from "node:url";
import type { AuthServerOptions } from "@svartz/auth/server";
import { definePlugin, getCompilerContributions, type NormalizedSvartzPlugin, type PluginContext, type SvartzPlugin } from "@svartz/core";
import { commitSource, mirrorsCommits, routeClaimsOf } from "@svartz/plugin-submissions/commits";
import { publishedAttachments, sharedAttachmentNames } from "@svartz/plugins";
import { alternateNames } from "@svartz/plugins/routes";
import { PAGES, PLUGIN_ID, type BrowserOptions, type HistoryData } from "./api";
import { PERMISSIONS } from "./permissions";

export type { BrowserOptions } from "./api";

// Beside this module in dist.
const SERVER_MODULE = fileURLToPath(new URL("./server.js", import.meta.url));
const BROWSER_SCRIPT = fileURLToPath(new URL("./browser.js", import.meta.url));
const STYLESHEET = fileURLToPath(new URL("./browser.css", import.meta.url));

function fail(message: string): never {
  throw new Error(`[history] ${message}`);
}

const needsMirror = (vault: string) =>
  `vault "${vault}" enables history without the submissions plugin's GitHub mirror; add submissions({ repo, app, sync: { … } }) to the same vault`;

/**
 * The folder of user pages below the deployment base, such as `/wiki/users/`, when the vault built by `ctx` holds
 * them: auth resolves which vault does in `forVault`, into its server options.
 */
function userPagesOf(ctx: PluginContext): string | undefined {
  const plugins = (ctx.plugins ?? ctx.config.plugins ?? []) as readonly (SvartzPlugin | NormalizedSvartzPlugin)[];
  const options = plugins.find(({ id }) => id === "auth")?.server?.options as AuthServerOptions | undefined;
  if (!options?.userPages || options.userPageVault !== ctx.config.id) return undefined;
  return `${ctx.config.mountPath ?? ""}/${options.userPages}/`;
}

/** Page history and Recent changes, as plugin pages, and a History action on every published Markdown page. */
export function history(): NormalizedSvartzPlugin {
  const plugin: NormalizedSvartzPlugin = definePlugin(() => ({
    id: PLUGIN_ID,
    server: { module: SERVER_MODULE, pages: [...PAGES] },
    permissions: PERMISSIONS,
    forVault({ vault }) {
      if (!mirrorsCommits(vault.plugins)) fail(needsMirror(vault.id));
      return plugin;
    },
    emitArtifacts: {
      // After the submissions plugin's, which reads the vault's folder in the repository from git.
      options: { fatal: true, enforce: "post" },
      run(ctx) {
        const source = commitSource(ctx);
        const claims = routeClaimsOf(ctx);
        if (!source || !claims) fail(needsMirror(ctx.config.id));
        const mountPath = ctx.config.mountPath ?? "";
        const frontmatter = new Map(ctx.files.map((file) => [file.slug, file.frontmatter]));
        // Protected notes stay out, as hidden ones already do: their history isn't the site's to show.
        const notes = (ctx.index?.entries ?? []).filter((entry) => !entry.locked).map((entry) => {
          const aliases = alternateNames(frontmatter.get(entry.slug), ctx.config.frontmatter.aliasesField);
          return { slug: entry.slug, path: entry.path.replaceAll("\\", "/"), href: entry.href, title: entry.title, ...(aliases.length ? { aliases } : {}) };
        });
        const compiler = getCompilerContributions(ctx);
        compiler.serverData.set(PLUGIN_ID, {
          source,
          claims,
          notes,
          preview: {
            linkResolution: ctx.config.linkResolution,
            mountPath,
            // Inline `#tags` link under the theme's tags route, as core:transform-ofm links them.
            tagsRoute: (ctx.config.theme.routes as { tags?: string } | undefined)?.tags ?? "tags",
            attachments: publishedAttachments(ctx).map((file) => file.path),
            sharedNames: sharedAttachmentNames(ctx),
          },
        } satisfies HistoryData);
        const userPages = userPagesOf(ctx);
        compiler.browserResources.set(PLUGIN_ID, {
          id: PLUGIN_ID,
          kind: "script",
          importId: BROWSER_SCRIPT,
          options: {
            mountPath,
            pages: notes.filter(({ path }) => /\.md$/i.test(path)).map(({ href }) => href),
            ...(userPages ? { userPages } : {}),
          } satisfies BrowserOptions,
        });
        compiler.browserResources.set(`${PLUGIN_ID}:css`, { id: `${PLUGIN_ID}:css`, kind: "css", importId: STYLESHEET });
      },
    },
  }))();
  return plugin;
}
