import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Effect } from "effect";
import { lookup } from "mrmime";
import {
  executeHandleChange,
  runStages,
  type Artifact,
  type BrowserResource,
  type ChangeEvent,
  type PluginContext,
  type StageName,
  type SvartzTheme,
} from "@svartz/core";
import type { Plugin, ViteDevServer } from "vite";
import {
  RESOLVED_ARTIFACTS_VIRTUAL_ID,
  RESOLVED_THEME_VIRTUAL_ID,
  loadVirtualModule,
  resolveVirtualModuleId,
  type ResolvedSvartzVirtualModuleId,
  type SvartzVirtualModuleId,
} from "./virtual-modules";
import {
  createArtifactsVirtualModuleSource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
  getGeneratedSearchModulePath,
  getVaultBuildRoot,
} from "./artifacts";
import { createSvartzViteContext, type SvartzViteContext } from "./context";
import type { SvartzVitePluginOptions } from "./options";
import {
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleId,
  resolveThemePackageRoot,
  resolveThemeRuntimeImportId,
  type ThemeModule,
} from "./theme-resolver";
import {
  assertRequiredStages,
  getThemePresetPlugins,
  resolveRuntimePlugins,
} from "./plugins";
import { createVaultChangeEvent } from "./watch";

const PIPELINE_STAGES: readonly StageName[] = [
  "discoverFiles",
  "parseFrontmatter",
  "filterUnpublished",
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

function extractThemeConfig(theme: { base: string; [key: string]: unknown }): Record<string, unknown> {
  const { base: _base, ...rest } = theme;
  return rest;
}

function svartz(options: SvartzVitePluginOptions): Plugin {
  let context = createSvartzViteContext(options);
  let themeModuleId = resolveThemeModuleId(context.config);
  let theme: SvartzTheme | undefined;
  let plugins = resolveRuntimePlugins(context.config);
  let emittedArtifacts: Artifact[] = [];
  let emittedAssets = new Map<string, Artifact>();
  let emittedBrowserResources: BrowserResource[] = [];
  let runnerMeta = new Map<string, unknown>();
  let devServer: ViteDevServer | undefined;
  let pendingChange: ChangeEvent | undefined;
  let rebuildPromise: Promise<void> | undefined;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

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
    theme = await loadThemeModule((id) => import(id), context.config, context.root);
    plugins = resolveRuntimePlugins(context.config, theme);
    const runnerContext = createRunnerContext();

    if (changeEvent) {
      const changeResult = await executeHandleChange(plugins, changeEvent, runnerContext);
      if (changeResult.fatalError) {
        throw changeResult.fatalError;
      }

      logHandleChangeErrors(changeResult.errors);
    }

    await runStages(plugins, runnerContext, PIPELINE_STAGES);
    runnerMeta = runnerContext.meta;
    emittedArtifacts = [...runnerContext.artifacts.values()];
    emittedBrowserResources = [...(runnerContext.compiler?.browserResources.values() ?? [])];
    emittedAssets = new Map(emittedArtifacts
      .filter((artifact) => artifact.type === "asset" && artifact.key.startsWith("assets/"))
      .map((artifact) => [artifact.key.slice("assets/".length), artifact]));

    await Effect.runPromise(
      Effect.all(
        [
          writeGeneratedModule(
            getGeneratedRuntimeThemeModulePath(context.config),
            createThemeVirtualModuleSource(themeModuleId, extractThemeConfig(context.config.theme)),
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
            ),
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
    name: "svartz:vite",
    enforce: "post",
    config() {
      const alias: Record<string, string> = {
        "virtual:svartz/theme": getGeneratedRuntimeThemeModulePath(options.config),
        "virtual:svartz/artifacts": getGeneratedRuntimeArtifactsModulePath(options.config),
      };
      const themeSourcePath = process.env["SVARTZ_THEME_SOURCE_PATH"];
      if (themeSourcePath && options.config.theme?.base) {
        alias[options.config.theme.base] = themeSourcePath;
      }
      return {
        resolve: {
          alias,
        },
      };
    },
    configResolved(resolved) {
      context = createSvartzViteContext(options, resolved);
      themeModuleId = resolveThemeRuntimeImportId(context.config, context.root);
    },
    async buildStart() {
      await executePipeline();
    },
    generateBundle() {
      if (this.environment.name !== "client") return;
      for (const artifact of publicAssets()) {
        this.emitFile({
          type: "asset",
          fileName: artifact.key.slice("assets/".length),
          source: artifact.contents,
        });
      }
    },
    async writeBundle(options) {
      if (this.environment.name !== "ssr" || !options.dir) return;
      if (basename(options.dir) !== "server" || basename(dirname(options.dir)) !== "output") return;

      const clientRoot = join(dirname(options.dir), "client");
      await Promise.all(publicAssets().map(async (artifact) => {
        const path = join(clientRoot, artifact.key.slice("assets/".length));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, artifact.contents);
      }));
    },
    configureServer(server) {
      devServer = server;
      server.watcher.add(context.config.path);
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

      return () => {
        clearTimeout(primeTimer);
        if (rebuildTimer) {
          clearTimeout(rebuildTimer);
        }
        server.watcher.off("add", onAdd);
        server.watcher.off("change", onChange);
        server.watcher.off("unlink", onUnlink);
        if (devServer === server) {
          devServer = undefined;
        }
      };
    },
    resolveId(id) {
      return resolveVirtualModuleId(id) ?? null;
    },
    load(id) {
      if (id === RESOLVED_THEME_VIRTUAL_ID) {
        return createThemeVirtualModuleSource(themeModuleId, extractThemeConfig(context.config.theme));
      }

      if (id === RESOLVED_ARTIFACTS_VIRTUAL_ID) {
        return createArtifactsVirtualModuleSource(
          emittedArtifacts,
          getGeneratedIndexModulePath(context.config),
          getGeneratedSearchModulePath(context.config),
          extractThemeConfig(context.config.theme),
          context.config.site,
          emittedBrowserResources,
        );
      }

      return loadVirtualModule(id) ?? null;
    },
  };
}

export default svartz;
export { svartz };
export {
  createArtifactsVirtualModuleSource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
  getGeneratedSearchModulePath,
  getVaultBuildRoot,
  createSvartzViteContext,
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleId,
  resolveThemePackageRoot,
  resolveThemeRuntimeImportId,
  loadVirtualModule,
  resolveVirtualModuleId,
  assertRequiredStages,
  getThemePresetPlugins,
  resolveRuntimePlugins,
  createVaultChangeEvent,
};
export type {
  ResolvedSvartzVirtualModuleId,
  SvartzVirtualModuleId,
  SvartzViteContext,
  SvartzVitePluginOptions,
  ThemeModule,
};
