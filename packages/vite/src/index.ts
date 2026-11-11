import { realpathSync } from "node:fs";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
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
  type StageName,
  type SvartzTheme,
} from "@svartz/core";
import { normalizePath, type Plugin, type Rollup, type ViteDevServer } from "vite";
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
  assertRequiredStages,
  assertServerPlugins,
  getThemePresetPlugins,
  resolveRuntimePlugins,
} from "./plugins";
import { createVaultChangeEvent } from "./watch";
import { isHostRouteFile, staticHostRoutes } from "./manual-routes";
import {
  createHostRegistrySource,
  createHostServerSource,
  deploymentBasePath,
  getGeneratedHostRegistryPath,
  getGeneratedHostServerPath,
  getGeneratedHostStylesPath,
  readHostAdapterName,
  svelteKitBasePath,
} from "./host-registry";
import { emitProtectedGroupArtifacts } from "./protected-payload";
import { clearPublicAssets, recordPublicAssets } from "./public-assets";
import { writeProtectedBridgeModules, type ProtectedBridgeModule } from "./protected-bridge";
import { themeSourceAliases } from "./theme-aliases";

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
  // Bare ids until `configResolved` resolves them from the app root.
  const { base } = context.config.theme;
  let themeImport: ThemeImport = typeof base === "string" ? base : { compose: "@svartz/theme-minimal/runtime", themes: base };
  let theme: SvartzTheme | undefined;
  let plugins: ReturnType<typeof resolveRuntimePlugins> = [];
  let emittedArtifacts: Artifact[] = [];
  let emittedAssets = new Map<string, Artifact>();
  let emittedBrowserResources: BrowserResource[] = [];
  let protectedBridgeModules: ProtectedBridgeModule[] = [];
  let runnerMeta = new Map<string, unknown>();
  let devServer: ViteDevServer | undefined;
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

  /**
   * A host app routes plugin requests only when its server hooks run `svartzHandle`. Unused, the import is
   * tree-shaken, so this vault's handle is missing from the server bundle.
   */
  function missingHostServerHandle(bundle: Rollup.OutputBundle): string | undefined {
    if (context.config.target.type !== "host") return;
    const server = plugins.find((plugin) => plugin.server);
    if (!server) return;
    const id = normalizePath(realpathSync(getGeneratedRuntimeServerModulePath(context.config)));
    const routed = Object.values(bundle).some((item) =>
      item.type === "chunk" && item.modules[id]?.renderedExports.includes("svartzHandle"));
    if (routed) return;
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
      (id) => import(id), context.config, context.root, selectedThemeSources(context.config),
    );
    plugins = resolveRuntimePlugins(context.config, theme, hostAdapter);
    const runnerContext = createRunnerContext();
    runnerContext.meta.set("svartz:mode", context.mode);
    runnerContext.meta.set("svartz:theme", theme);
    runnerContext.meta.set("svartz:protectedBridgeImports", new Set<string>());
    // The emitter and host bridge are installed before publication filtering runs.
    runnerContext.meta.set("svartz:protectionReady", true);
    if (context.config.target.type === "host") {
      runnerContext.meta.set("reservedRoutes", await staticHostRoutes(context.root, context.config.mountPath));
    }

    if (changeEvent && !isHostRouteFile(context.root, changeEvent.file)) {
      const changeResult = await executeHandleChange(plugins, changeEvent, runnerContext);
      if (changeResult.fatalError) {
        throw changeResult.fatalError;
      }

      logHandleChangeErrors(changeResult.errors);
    }

    await runStages(plugins, runnerContext, PIPELINE_STAGES);
    await emitProtectedGroupArtifacts(runnerContext, context.root);
    protectedBridgeModules = await writeProtectedBridgeModules(runnerContext);
    runnerMeta = runnerContext.meta;
    emittedArtifacts = [...runnerContext.artifacts.values()];
    emittedBrowserResources = [...(runnerContext.compiler?.browserResources.values() ?? [])]
      .map((resource) => resource.importId.startsWith("@svartz/plugins/")
        ? { ...resource, importId: fileURLToPath(import.meta.resolve(resource.importId)) }
        : resource);
    emittedAssets = new Map(emittedArtifacts
      .filter((artifact) => artifact.type === "asset" && artifact.key.startsWith("assets/"))
      .map((artifact) => [assetOutputPath(artifact), artifact]));
    recordPublicAssets(context.config.id, [...emittedAssets].map(([fileName, artifact]) => ({ fileName, path: artifact.path })));

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
            createServerRegistrySource(context.config, plugins, deploymentBasePath(context.config, kitBasePath)),
          ),
        ],
        { concurrency: "unbounded", discard: true },
      ),
    );

    if (devServer) {
      await invalidateGeneratedModules(devServer);
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
      kitBasePath = svelteKitBasePath(resolved.define);
      themeImport = resolveThemeRuntimeImport(context.config, context.root, selectedThemeSources(context.config));
      if (context.config.target.type === "host") hostAdapter = await readHostAdapterName(context.root);
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
      const target = context.config.target.type;
      // Server plugins on Cloudflare read bindings; in dev those come from the project's Wrangler config.
      // The close() wrapper below stops them, so middleware mode (no httpServer) releases them too.
      const stopDevBindings = target === "cloudflare-workers" || target === "cloudflare-pages" || hostAdapter === CLOUDFLARE_ADAPTER
        ? serveDevBindings(options.projectRoot ?? context.root, context.root)
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
        await stopDevBindings?.();
        await close();
      };
    },
    resolveId(id) {
      if (options.exposeVirtualModules === false) return null;
      return resolveVirtualModuleId(id) ?? null;
    },
    load(id) {
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
        return createServerRegistrySource(context.config, plugins, deploymentBasePath(context.config, kitBasePath));
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
  assertRequiredStages,
  assertServerPlugins,
  getThemePresetPlugins,
  resolveRuntimePlugins,
  createVaultChangeEvent,
  createHostRegistrySource,
  createHostServerSource,
  getGeneratedHostRegistryPath,
  getGeneratedHostServerPath,
  getGeneratedHostStylesPath,
  svelteKitBasePath,
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
