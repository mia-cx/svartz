import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { lookup } from "mrmime";
import {
  executeHandleChange,
  runStages,
  type Artifact,
  type BrowserResource,
  type ChangeEvent,
  type PluginContext,
  type ResolvedConfig,
  type RouteIndex,
  type StageName,
  type SvartzTheme,
} from "@svartz/core";
import { loadEnv, normalizePath, type Plugin, type Rollup, type ViteDevServer } from "vite";
import {
  RESOLVED_ARTIFACTS_VIRTUAL_ID,
  RESOLVED_SERVER_VIRTUAL_ID,
  RESOLVED_THEME_VIRTUAL_ID,
  loadVirtualModule,
  resolveVirtualModuleId,
  type ResolvedSvartzVirtualModuleId,
  type SvartzVirtualModuleId,
} from "./virtual-modules";
import {
  createArtifactsVirtualModuleSource,
  createPluginPagesModuleSource,
  createServerRegistrySource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getGeneratedPluginPagesModulePath,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeServerModulePath,
  getGeneratedRuntimeThemeModulePath,
  getGeneratedSearchModulePath,
  getVaultBuildRoot,
} from "./artifacts";
import { createSvartzViteContext, type SvartzViteContext } from "./context";
import { serveDevBindings } from "./dev-bindings";
import type { SvartzVitePluginOptions } from "./options";
import {
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleIds,
  resolveThemePackageRoot,
  resolveThemeRuntimeImport,
  type ThemeImport,
  type ThemeModule,
  type ThemeSources,
} from "./theme-resolver";
import {
  assertNoNotesUnderPages,
  assertRequiredStages,
  assertServerPlugins,
  getThemePresetPlugins,
  hasPluginPages,
  resolveRuntimePlugins,
} from "./plugins";
import { createVaultChangeEvent } from "./watch";
import { isHostRouteFile, staticHostRoutes } from "./manual-routes";
import {
  createHostIndexSource,
  createHostRegistrySource,
  createHostServerSource,
  deploymentBasePath,
  getGeneratedHostIndexPath,
  getGeneratedHostRegistryPath,
  getGeneratedHostServerPath,
  getGeneratedHostStylesPath,
  isSvelteKit3,
  readHostAdapterName,
  readKitEnvDir,
  svelteKitBasePath,
  svelteKitPaths,
} from "./host-registry";
import { emitProtectedGroupArtifacts } from "./protected-payload";
import { clearPublicAssets, recordMarkdownRoutes, recordPublicAssets } from "./public-assets";
import { writeProtectedBridgeModules, type ProtectedBridgeModule } from "./protected-bridge";
import { themeSourceAliases } from "./theme-aliases";
import { clearSnapshotBuild, readSnapshotBuild, snapshotCacheable, snapshotKey, writeSnapshotBuild, type SnapshotBuild } from "./snapshot-cache";

const PIPELINE_STAGES: readonly StageName[] = [
  "discoverFiles",
  "parseFrontmatter",
  "filterUnpublished",
  "allocateRoutes",
  "resolveLinks",
  "transformOfm",
  "transformGfm",
  "transformToc",
  "transformDescription",
  "transformSyntax",
  "transformLatex",
  "transformEmbeds",
  "indexContent",
  "emitArtifacts",
] as const;

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function extractThemeConfig(theme: ResolvedConfig["theme"]): Record<string, unknown> {
  const { base: _base, ...rest } = theme;
  return rest;
}

const CLOUDFLARE_ADAPTER = "@sveltejs/adapter-cloudflare";

/** The selected workspace theme sources among this vault's themes. */
function selectedThemeSources(config: ResolvedConfig): ThemeSources {
  const sources = JSON.parse(process.env["SVARTZ_THEME_SOURCES"] ?? "{}") as ThemeSources;
  return Object.fromEntries(resolveThemeModuleIds(config).flatMap((id) => sources[id] ? [[id, sources[id]]] : []));
}

function svartz(options: SvartzVitePluginOptions): Plugin {
  let context = createSvartzViteContext(options);
  let kitBasePath: string | undefined;
  let hostAdapter: string | undefined;
  let kit3 = false;
  // Themes and Wrangler come from the project's install, which for the app Svartz ships isn't the Vite root's.
  const projectRoot = () => options.projectRoot ?? context.root;
  // The SvelteKit and platform the server registry runs under.
  const serverRuntime = () => {
    const target = context.config.target.type;
    return {
      kit3,
      cloudflare: target === "cloudflare-workers" || target === "cloudflare-pages" || hostAdapter === CLOUDFLARE_ADAPTER,
    };
  };
  // Bare ids until `configResolved` resolves them from the app root.
  const { base } = context.config.theme;
  let themeImport: ThemeImport = typeof base === "string" ? base : { compose: "@svartz/theme-minimal/runtime", themes: base };
  let theme: SvartzTheme | undefined;
  let plugins: ReturnType<typeof resolveRuntimePlugins> = [];
  let emittedArtifacts: Artifact[] = [];
  let emittedAssets = new Map<string, Artifact>();
  let markdownRoutes: Record<string, string> = {};
  let emittedBrowserResources: BrowserResource[] = [];
  let emittedServerData: ReadonlyMap<string, unknown> = new Map();
  let protectedBridgeModules: ProtectedBridgeModule[] = [];
  let runnerMeta = new Map<string, unknown>();
  let devServer: ViteDevServer | undefined;
  // Each of Vite's environments runs the pipeline; a snapshot reports what the cache did once.
  let snapshotReported = false;
  const reportSnapshot = (outcome: string) => {
    if (!snapshotReported) console.info(`[svartz] vault "${context.config.id}": ${outcome}`);
    snapshotReported = true;
  };
  let pendingChange: ChangeEvent | undefined;
  let rebuildPromise: Promise<void> | undefined;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

  function assetOutputPath(artifact: Artifact): string {
    const relative = artifact.key.slice("assets/".length);
    return `${context.config.mountPath.replace(/^\//, "")}/${relative}`.replace(/^\//, "");
  }

  function assetForRequest(url: string, base: string): Artifact | undefined {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
    } catch {
      return;
    }

    const prefix = base === "/" ? "/" : `${base.replace(/\/$/, "")}/`;
    if (!pathname.startsWith(prefix)) return;
    return emittedAssets.get(pathname.slice(prefix.length));
  }

  /** Whether `id` is this vault's server registry, which holds its server plugins' modules and options. */
  function isServerRegistry(id: string): boolean {
    const file = getGeneratedRuntimeServerModulePath(context.config);
    const target = normalizePath(id.replace(/\?.*$/, ""));
    return target === normalizePath(file) || (existsSync(file) && target === normalizePath(realpathSync(file)));
  }

  /**
   * A host app routes plugin requests only when its server hooks run `svartzHandle`. Unused, the import is
   * tree-shaken, so this vault's handle is missing from the server bundle.
   */
  function missingHostServerHandle(bundle: Rollup.OutputBundle): string | undefined {
    if (context.config.target.type !== "host") return;
    const server = plugins.find((plugin) => plugin.server);
    if (!server) return;
    const id = normalizePath(realpathSync(getGeneratedRuntimeServerModulePath(context.config)));
    const renders = (name: string) => Object.values(bundle).some((item) =>
      item.type === "chunk" && item.modules[id]?.renderedExports.includes(name));
    if (renders("svartzHandle")) return missingHostPageRoute(renders);
    return [
      `Vault "${context.config.id}" activates plugin "${server.id}", which serves requests, but the host app's server hooks don't run svartzHandle.`,
      "Add it to src/hooks.server.ts (or .js):",
      "",
      "  import { svartzHandle } from 'virtual:svartz/server';",
      "  export const handle = svartzHandle;",
      "",
      "If it already exports a handle, put svartzHandle first in a sequence:",
      "",
      "  import { sequence } from '@sveltejs/kit/hooks';",
      "  export const handle = sequence(svartzHandle, yourHandle);",
    ].join("\n");
  }

  /** A host app renders plugin pages only when a route's server `load` calls `svartzPage`; unused, it is tree-shaken. */
  function missingHostPageRoute(renders: (name: string) => boolean): string | undefined {
    if (!hasPluginPages(plugins) || renders("svartzPage")) return;
    const owner = plugins.find((plugin) => plugin.server?.pages?.length)!;
    return [
      `Vault "${context.config.id}" activates plugin "${owner.id}", which renders pages under /-/, but no route in the host app renders them.`,
      "Run `npx svartz init` to add src/routes/[...mount=svartzMount]/-/[...page=svartzPage]/ and its param matchers, or copy them from the docs (host-vaults.md#plugin-pages).",
    ].join("\n");
  }

  function publicAssets(): Artifact[] {
    return [...emittedAssets.values()];
  }

  function writeGeneratedModule(path: string, source: string): Effect.Effect<void, Error> {
    return Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => mkdir(dirname(path), { recursive: true }),
        catch: toError,
      });
      yield* Effect.tryPromise({
        try: () => writeFile(path, source),
        catch: toError,
      });
    });
  }

  function createRunnerContext(): PluginContext {
    return {
      config: context.config,
      plugins,
      files: [],
      artifacts: new Map(),
      meta: runnerMeta,
    };
  }

  async function invalidateGeneratedModules(server: ViteDevServer): Promise<void> {
    const generatedPaths = [
      getGeneratedRuntimeThemeModulePath(context.config),
      getGeneratedRuntimeArtifactsModulePath(context.config),
      getGeneratedRuntimeServerModulePath(context.config),
      getGeneratedPluginPagesModulePath(context.config),
      getGeneratedIndexModulePath(context.config),
      getGeneratedSearchModulePath(context.config),
      ...emittedArtifacts.map((artifact) => artifact.path),
    ];

    for (const file of generatedPaths) {
      const modules = server.moduleGraph.getModulesByFile(file);
      if (!modules) continue;
      for (const module of modules) {
        server.moduleGraph.invalidateModule(module);
      }
    }
  }

  function logHandleChangeErrors(errors: readonly { pluginId: string; message: string }[]): void {
    if (errors.length === 0) return;
    const logger = devServer?.config.logger;

    for (const error of errors) {
      logger?.warn(
        `[svartz:vite] handleChange warning from "${error.pluginId}": ${error.message}`,
      );
    }
  }

  async function executePipeline(changeEvent?: ChangeEvent): Promise<void> {
    theme = await loadThemeModule(
      (id) => import(id), context.config, projectRoot(), selectedThemeSources(context.config),
    );
    plugins = resolveRuntimePlugins(context.config, theme, hostAdapter);
    // Host routes take URLs from notes when routes are allocated, so the cache key reads them before the lookup.
    const reservedRoutes = context.config.target.type === "host"
      ? await staticHostRoutes(context.root, context.config.mountPath)
      : undefined;
    const snapshot = options.snapshot && snapshotCacheable(context.config)
      ? await snapshotKey(context.config, options.snapshot, {
          mode: context.mode, theme, plugins, themeImport, base: deploymentBasePath(context.config, kitBasePath), runtime: serverRuntime(),
          reservedRoutes: reservedRoutes && [...reservedRoutes].sort(),
        }, plugins.flatMap(({ reads = [] }) => reads))
      : undefined;
    const cached = snapshot && await readSnapshotBuild(context.config, snapshot);
    if (cached) {
      await restoreSnapshotBuild(cached);
      reportSnapshot("reused its build from the cache");
      return;
    }
    // Any snapshot pipeline run rewrites the files a cached entry names, cached or not, so the entry goes first.
    if (options.snapshot) await clearSnapshotBuild(context.config);
    const runnerContext = createRunnerContext();
    runnerContext.meta.set("svartz:mode", context.mode);
    runnerContext.meta.set("svartz:theme", theme);
    runnerContext.meta.set("svartz:protectedBridgeImports", new Set<string>());
    // The emitter and host bridge are installed before publication filtering runs.
    runnerContext.meta.set("svartz:protectionReady", true);
    if (reservedRoutes) runnerContext.meta.set("reservedRoutes", reservedRoutes);

    if (changeEvent && !isHostRouteFile(context.root, changeEvent.file)) {
      const changeResult = await executeHandleChange(plugins, changeEvent, runnerContext);
      if (changeResult.fatalError) {
        throw changeResult.fatalError;
      }

      logHandleChangeErrors(changeResult.errors);
    }

    await runStages(plugins, runnerContext, PIPELINE_STAGES);
    assertNoNotesUnderPages(context.config, plugins, runnerContext.index?.routes.all ?? []);
    await emitProtectedGroupArtifacts(runnerContext, context.root);
    protectedBridgeModules = await writeProtectedBridgeModules(runnerContext);
    runnerMeta = runnerContext.meta;
    emittedArtifacts = [...runnerContext.artifacts.values()];
    emittedBrowserResources = [...(runnerContext.compiler?.browserResources.values() ?? [])]
      .map((resource) => resource.importId.startsWith("@svartz/plugins/")
        ? { ...resource, importId: fileURLToPath(import.meta.resolve(resource.importId)) }
        : resource);
    emittedServerData = runnerContext.compiler?.serverData ?? new Map();
    emittedAssets = new Map(emittedArtifacts
      .filter((artifact) => artifact.type === "asset" && artifact.key.startsWith("assets/"))
      .map((artifact) => [assetOutputPath(artifact), artifact]));
    assertNothingUnderNestedMounts(runnerContext.index?.routes, [...emittedAssets.keys()]);
    recordPublicAssets(context.config.id, [...emittedAssets].map(([fileName, artifact]) => ({ fileName, path: artifact.path })));
    const base = deploymentBasePath(context.config, kitBasePath);
    markdownRoutes = Object.fromEntries((runnerContext.index?.entries ?? []).flatMap((entry) =>
      entry.markdownHref && emittedAssets.has(entry.markdownHref.slice(1))
        ? [[`${base}${entry.href}`, `${base}${entry.markdownHref}`]] : []));
    // The standalone adapter runs in this build process, after prerendering, ahead of static serving.
    recordMarkdownRoutes(context.config.id, markdownRoutes);

    await Effect.runPromise(
      Effect.all(
        [
          writeGeneratedModule(
            getGeneratedRuntimeThemeModulePath(context.config),
            createThemeVirtualModuleSource(themeImport, extractThemeConfig(context.config.theme)),
          ),
          writeGeneratedModule(
            getGeneratedRuntimeArtifactsModulePath(context.config),
            createArtifactsVirtualModuleSource(
              emittedArtifacts,
              getGeneratedIndexModulePath(context.config),
              getGeneratedSearchModulePath(context.config),
              extractThemeConfig(context.config.theme),
              context.config.site,
              emittedBrowserResources,
              context.config.id,
              protectedBridgeModules,
              deploymentBasePath(context.config, kitBasePath),
            ),
          ),
          writeGeneratedModule(
            getGeneratedRuntimeServerModulePath(context.config),
            createServerRegistrySource(
              context.config, plugins, deploymentBasePath(context.config, kitBasePath), markdownRoutes, emittedServerData,
              serverRuntime(),
            ),
          ),
          writeGeneratedModule(getGeneratedPluginPagesModulePath(context.config), createPluginPagesModuleSource(plugins)),
        ],
        { concurrency: "unbounded", discard: true },
      ),
    );

    if (snapshot) {
      const assets = [...emittedAssets].map(([fileName, { key, path }]) => ({ key, fileName, path }));
      await writeSnapshotBuild(context.config, snapshot, { assets, markdownRoutes });
      reportSnapshot("built, and cached for the next build");
    }

    if (devServer) {
      await invalidateGeneratedModules(devServer);
    }
  }

  /** Takes up a snapshot's cached build: its generated modules are on disk already, so only its public files load. */
  async function restoreSnapshotBuild(build: SnapshotBuild): Promise<void> {
    emittedAssets = new Map(await Promise.all(build.assets.map(async ({ key, fileName, path }) =>
      [fileName, { key, path, type: "asset", pluginId: "svartz:snapshot-cache", contents: await readFile(path) }] as const)));
    emittedArtifacts = [...emittedAssets.values()];
    markdownRoutes = build.markdownRoutes;
    recordPublicAssets(context.config.id, build.assets.map(({ fileName, path }) => ({ fileName, path })));
    recordMarkdownRoutes(context.config.id, markdownRoutes);
  }

  /**
   * A version's pages and public files are served below its mount, so the vault it's built inside can publish neither
   * there. `files` are public file names below the client root, as `assetOutputPath` gives them.
   */
  function assertNothingUnderNestedMounts(routes: RouteIndex | undefined, files: readonly string[]): void {
    if (!options.nestedMounts?.length) return;
    const published = [...(routes?.all ?? []), ...Object.keys(routes?.redirects ?? {}), ...files.map((file) => `/${file}`)];
    for (const path of published) {
      // The mount itself counts: static output needs it to be the folder holding the version's pages.
      const mount = options.nestedMounts.find((nested) => path === nested || path.startsWith(`${nested}/`));
      if (!mount) continue;
      throw new Error(`Vault "${context.config.id}" publishes ${path}, where version ${mount}/ is served. Rename the note, file or folder, or the version.`);
    }
  }

  function scheduleVaultRebuild(event: ChangeEvent): void {
    pendingChange = event;

    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }

    rebuildTimer = setTimeout(() => {
      void drainQueuedRebuilds();
    }, 75);
  }

  async function drainQueuedRebuilds(): Promise<void> {
    if (rebuildPromise) return;

    const nextChange = pendingChange;
    pendingChange = undefined;
    if (!nextChange || !devServer) return;

    rebuildPromise = (async () => {
      try {
        await executePipeline(nextChange);
        devServer?.ws.send({ type: "full-reload" });
      } catch (cause) {
        const error = toError(cause);
        devServer?.config.logger.error(
          `[svartz:vite] rebuild failed for ${nextChange.file}: ${error.message}`,
          {
            error,
          },
        );
      }
    })();

    try {
      await rebuildPromise;
    } finally {
      rebuildPromise = undefined;
      if (pendingChange) {
        await drainQueuedRebuilds();
      }
    }
  }

  return {
    name: options.exposeVirtualModules === false ? `svartz:vite:${options.config.id}` : "svartz:vite",
    enforce: "post",
    config() {
      const virtualModules = options.exposeVirtualModules === false ? [] : [
        { find: "virtual:svartz/theme", replacement: getGeneratedRuntimeThemeModulePath(options.config) },
        { find: "virtual:svartz/artifacts", replacement: getGeneratedRuntimeArtifactsModulePath(options.config) },
        // A host app's `virtual:svartz/server` chains every host vault's handle; the CLI aliases it.
        ...(options.config.target.type === "host"
          ? []
          : [{ find: "virtual:svartz/server", replacement: getGeneratedRuntimeServerModulePath(options.config) }]),
      ];
      return {
        resolve: {
          alias: [...virtualModules, ...themeSourceAliases(selectedThemeSources(options.config))],
        },
      };
    },
    async configResolved(resolved) {
      context = createSvartzViteContext(options, resolved);
      kitBasePath = svelteKitPaths(resolved.define)?.base;
      themeImport = resolveThemeRuntimeImport(context.config, projectRoot(), selectedThemeSources(context.config));
      if (context.config.target.type === "host") hostAdapter = await readHostAdapterName(context.root, resolved.plugins);
      kit3 = isSvelteKit3(context.root);
    },
    async buildStart() {
      await executePipeline();
    },
    generateBundle(_output, bundle) {
      if (this.environment.name === "ssr") {
        const problem = missingHostServerHandle(bundle);
        if (problem) this.error(problem);
        return;
      }
      if (this.environment.name !== "client") return;
      for (const artifact of publicAssets()) {
        this.emitFile({
          type: "asset",
          fileName: assetOutputPath(artifact),
          source: artifact.contents,
        });
      }
    },
    async writeBundle(options) {
      if (this.environment.name !== "ssr" || !options.dir) return;
      if (basename(options.dir) !== "server" || basename(dirname(options.dir)) !== "output") return;

      const clientRoot = join(dirname(options.dir), "client");
      await Promise.all(publicAssets().map(async (artifact) => {
        const path = join(clientRoot, assetOutputPath(artifact));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, artifact.contents);
      }));
    },
    configureServer(server) {
      devServer = server;
      // Server plugins on Cloudflare read bindings; in dev those come from the project's Wrangler config. SvelteKit 3's
      // `$env/dynamic/private` holds only declared variables, so plugins get the app's `.env` from here too.
      // The close() wrapper below stops them, so middleware mode (no httpServer) releases them too.
      const { cloudflare } = serverRuntime();
      const dotenv = kit3 ? loadEnv(server.config.mode, readKitEnvDir(server.config.plugins), "") : {};
      const stopDevBindings = cloudflare || kit3
        ? serveDevBindings(options.wranglerDir ?? projectRoot(), projectRoot(), { wrangler: cloudflare, dotenv })
        : undefined;
      server.watcher.add(context.config.path);
      if (context.config.site.favicon) server.watcher.add(context.config.site.favicon);
      if (context.config.target.type === "host") server.watcher.add(join(context.root, "src/routes"));
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") return next();
        const artifact = assetForRequest(request.url ?? "", server.config.base ?? "/");
        if (!artifact) return next();

        response.setHeader("Content-Type", lookup(extname(artifact.key)) ?? "application/octet-stream");
        response.end(request.method === "HEAD" ? undefined : artifact.contents);
      });

      let watcherPrimed = false;
      const primeTimer = setTimeout(() => {
        watcherPrimed = true;
      }, 250);

      const onWatchEvent =
        (type: ChangeEvent["type"]) =>
        (file: string) => {
          if (!watcherPrimed) return;

          if (file === context.config.site.favicon) {
            scheduleVaultRebuild({ type, file });
            return;
          }

          if (context.config.target.type === "host" && isHostRouteFile(context.root, file)) {
            scheduleVaultRebuild({ type, file });
            return;
          }
          const event = createVaultChangeEvent(context.config, type, file);
          if (!event) return;
          scheduleVaultRebuild(event);
        };

      const onAdd = onWatchEvent("add");
      const onChange = onWatchEvent("change");
      const onUnlink = onWatchEvent("unlink");

      server.watcher.on("add", onAdd);
      server.watcher.on("change", onChange);
      server.watcher.on("unlink", onUnlink);

      // A function returned from `configureServer` is Vite's post-middleware hook, which runs as soon as the
      // server is set up. The watchers go when this server closes instead, middleware mode included. Vite
      // restarts by configuring the new server before closing the old one, with this plugin instance reused,
      // so each server releases only its own listeners, and the shared rebuild state only while it is current.
      const close = server.close.bind(server);
      server.close = async () => {
        clearTimeout(primeTimer);
        server.watcher.off("add", onAdd);
        server.watcher.off("change", onChange);
        server.watcher.off("unlink", onUnlink);
        if (devServer === server) {
          if (rebuildTimer) clearTimeout(rebuildTimer);
          rebuildTimer = undefined;
          devServer = undefined;
        }
        // Each server stops only its own bindings; a replacement's registration survives (serveDevBindings checks).
        // The server closes even when the proxy fails to stop, and that failure still surfaces.
        try {
          await stopDevBindings?.();
        } finally {
          await close();
        }
      };
    },
    resolveId(id) {
      if (options.exposeVirtualModules === false) return null;
      return resolveVirtualModuleId(id) ?? null;
    },
    load(id) {
      // The registry lives outside the app, where SvelteKit's server-only guard doesn't reach; refuse it in the
      // browser so plugin modules and options never land in client chunks.
      if (this?.environment?.config.consumer === "client" && isServerRegistry(id)) {
        this.error(`Browser code imports virtual:svartz/server, which holds vault "${context.config.id}"'s server plugins. Import it only from src/hooks.server.ts.`);
      }
      if (options.exposeVirtualModules === false) return null;
      if (id === RESOLVED_THEME_VIRTUAL_ID) {
        return createThemeVirtualModuleSource(themeImport, extractThemeConfig(context.config.theme));
      }

      if (id === RESOLVED_ARTIFACTS_VIRTUAL_ID) {
        return createArtifactsVirtualModuleSource(
          emittedArtifacts,
          getGeneratedIndexModulePath(context.config),
          getGeneratedSearchModulePath(context.config),
          extractThemeConfig(context.config.theme),
          context.config.site,
          emittedBrowserResources,
          context.config.id,
          protectedBridgeModules,
          deploymentBasePath(context.config, kitBasePath),
        );
      }

      if (id === RESOLVED_SERVER_VIRTUAL_ID) {
        return createServerRegistrySource(
          context.config, plugins, deploymentBasePath(context.config, kitBasePath), markdownRoutes, emittedServerData,
          serverRuntime(),
        );
      }

      return loadVirtualModule(id) ?? null;
    },
  };
}

export default svartz;
export { svartz };
export { themeSourceAliases } from "./theme-aliases";
export {
  createArtifactsVirtualModuleSource,
  createServerRegistrySource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeServerModulePath,
  getGeneratedRuntimeThemeModulePath,
  getGeneratedSearchModulePath,
  getVaultBuildRoot,
  createSvartzViteContext,
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleIds,
  resolveThemePackageRoot,
  resolveThemeRuntimeImport,
  loadVirtualModule,
  resolveVirtualModuleId,
  assertNoNotesUnderPages,
  assertRequiredStages,
  assertServerPlugins,
  getThemePresetPlugins,
  resolveRuntimePlugins,
  createVaultChangeEvent,
  createHostIndexSource,
  createHostRegistrySource,
  createHostServerSource,
  getGeneratedHostIndexPath,
  getGeneratedHostRegistryPath,
  getGeneratedHostServerPath,
  getGeneratedHostStylesPath,
  isSvelteKit3,
  svelteKitBasePath,
  svelteKitPaths,
  clearPublicAssets,
};
export type {
  ResolvedSvartzVirtualModuleId,
  SvartzVirtualModuleId,
  SvartzViteContext,
  SvartzVitePluginOptions,
  ThemeImport,
  ThemeModule,
  ThemeSources,
};
