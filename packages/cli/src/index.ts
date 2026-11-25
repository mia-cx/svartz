#!/usr/bin/env node

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { Data, Effect, Either } from "effect";
import {
  loadConfig,
  type ResolvedConfig,
  type ResolvedConfigSet,
} from "@svartz/config";
import {
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedPagesRoot,
  getGeneratedRuntimeThemeModulePath,
  createHostIndexSource,
  createHostRegistrySource,
  createHostServerSource,
  getGeneratedHostStylesPath,
  getGeneratedHostIndexPath,
  getGeneratedHostRegistryPath,
  getGeneratedHostServerPath,
  svelteKitPaths,
  getVaultBuildRoot,
  resolveThemeModuleIds,
  resolveThemePackageRoot,
  svartz,
  clearPublicAssets,
} from "@svartz/vite";
import {
  createBuilder,
  createServer,
  loadConfigFromFile,
  mergeConfig,
  preview as vitePreview,
  type InlineConfig,
  type ServerOptions,
} from "vite";
import {
  createDevWatcher,
  createWorkspaceSourceWatchDescriptors,
  getThemeWatchDescriptors,
  getConfigWatchDescriptors,
  getViteConfigWatchDescriptors,
  isLocalWorkspacePackage,
  uniqBuildFilters,
  type WatchDescriptor,
} from "./dev-watch";
import { writeGeneratedHostTailwindSourcesFile, writeGeneratedTailwindSourcesFile } from "./tailwind-sources";
import { syncManagedTurboFiles } from "./turbo-sync";
import { resolveHostApp, shippedApp, type AppLocation } from "./workspace";
import { writeVaultWranglerConfig } from "./wrangler-config";
import { commandExecutable, initProject, packageManager } from "./init";
import { withVaultBuildLock } from "./build-lock";

class CliAppRootMissing extends Data.TaggedError("CliAppRootMissing")<{
  readonly appRoot: string;
  readonly message: string;
}> {}

class CliVaultNotFound extends Data.TaggedError("CliVaultNotFound")<{
  readonly vaultId: string;
  readonly availableVaults: readonly string[];
  readonly message: string;
}> {}

class CliUnsupportedTarget extends Data.TaggedError("CliUnsupportedTarget")<{
  readonly vaultId: string;
  readonly targetType: string;
  readonly message: string;
}> {}

class CliViteConfigMissing extends Data.TaggedError("CliViteConfigMissing")<{
  readonly path: string;
  readonly message: string;
}> {}

type CliError =
  | CliAppRootMissing
  | CliVaultNotFound
  | CliUnsupportedTarget
  | CliViteConfigMissing
  | Error;

type SharedOptions = {
  readonly config?: string;
};

type BuildOptions = SharedOptions & {
  readonly vault?: string;
};

type DevOptions = BuildOptions & {
  readonly host?: string;
  readonly port?: string;
};

type PreviewOptions = BuildOptions & {
  readonly host?: string;
  readonly port?: string;
};

type WorkspaceContext = {
  readonly config: ResolvedConfigSet;
  readonly projectRoot: string;
  /** The SvelteKit app beside the config, which `host` vaults mount in. */
  readonly hostApp: AppLocation | undefined;
};

type DevWatchContext = {
  readonly workspace: WorkspaceContext;
  readonly workspaceRoot: string;
  readonly descriptors: readonly WatchDescriptor[];
};

const PLATFORM_ENV_KEYS = [
  "CF_PAGES",
  "VERCEL",
  "NETLIFY",
  "GITHUB_ACTION_REPOSITORY",
  "SST",
  "GCP_BUILDPACKS",
] as const;
const CLI_ENTRY_PATH = fileURLToPath(import.meta.url);
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    if (Either.isRight(result)) return result.right;
    throw result.left;
  });

const dedupeWatchDescriptors = (
  descriptors: readonly WatchDescriptor[],
): WatchDescriptor[] => {
  const seen = new Set<string>();
  const deduped: WatchDescriptor[] = [];

  for (const descriptor of descriptors) {
    const key = `${descriptor.path}:${descriptor.exact ? "exact" : "dir"}:${(descriptor.buildFilters ?? []).join(",")}:${descriptor.buildDirectory ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(descriptor);
  }

  return deduped;
};

const runCommand = (
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} exited due to signal ${signal}`
            : `${command} ${args.join(" ")} exited with code ${String(code ?? "unknown")}`,
        ),
      );
    });
  });

const buildWorkspacePackages = async (
  workspaceRoot: string,
  filters: readonly string[],
): Promise<void> => {
  for (const filter of uniqBuildFilters(filters)) {
    await runCommand(PNPM_COMMAND, ["--filter", filter, "build"], workspaceRoot);
  }
};

const serializeDevRunnerArgs = (subcommand: string, options: DevOptions): string[] => [
  CLI_ENTRY_PATH,
  subcommand,
  ...(options.config ? ["--config", options.config] : []),
  ...(options.vault ? ["--vault", options.vault] : []),
  ...(options.host ? ["--host", options.host] : []),
  ...(options.port ? ["--port", options.port] : []),
];

const startDevRunnerChild = (options: DevOptions): ChildProcess =>
  spawn(process.execPath, serializeDevRunnerArgs("dev:runner", options), {
    env: process.env,
    stdio: "inherit",
  });

const waitForChildExit = (
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

const stopDevRunnerChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    waitForChildExit(child).then(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 5_000);
    }),
  ]);
};

const basePathForVault = (vault: ResolvedConfig): string =>
  (vault.target.type === "static" || vault.target.type === "node") &&
  typeof vault.target.basePath === "string"
    ? vault.target.basePath
    : "";

const kitOutDirForVault = (vault: ResolvedConfig): string =>
  path.join(getVaultBuildRoot(vault), ".svelte-kit");

const applyPlatformEnvForVault = (vault: ResolvedConfig): void => {
  for (const key of PLATFORM_ENV_KEYS) {
    delete process.env[key];
  }

  if (vault.target.type === "cloudflare-pages") {
    process.env["CF_PAGES"] = "1";
  }
};

/**
 * The `node_modules` directory the app's own imports resolve from: the nearest one above it holding SvelteKit. For the
 * shipped app that's where the package manager put `svartz`'s dependencies, not inside the app itself.
 */
const appDependencies = (appRoot: string): string => {
  for (let directory = appRoot; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, "node_modules");
    if (existsSync(path.join(candidate, "@sveltejs", "kit"))) return candidate;
    if (path.dirname(directory) === directory) return path.join(appRoot, "node_modules");
  }
};

/**
 * Link the vault's build root `node_modules` to the app's dependencies, so the modules generated there import the
 * app's copies of Svelte, SvelteKit and `@svartz/ui`. What the app lacks, such as the project's themes, still
 * resolves from the project, further up.
 */
const ensureVaultWorkspace = (
  appRoot: string,
  vault: ResolvedConfig,
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const workspaceRoot = getVaultBuildRoot(vault);
      const workspaceNodeModulesPath = path.join(workspaceRoot, "node_modules");
      const appNodeModulesPath = appDependencies(appRoot);

      await mkdir(workspaceRoot, { recursive: true });

      try {
        const existing = await lstat(workspaceNodeModulesPath);
        // Only ever replace the link this made: a real node_modules belongs to someone else.
        if (!existing.isSymbolicLink()) {
          throw new Error(`${workspaceNodeModulesPath} isn't Svartz's to replace. Give the vault an outDir whose parent Svartz owns.`);
        }
        const currentTarget = await readlink(workspaceNodeModulesPath);
        if (path.resolve(workspaceRoot, currentTarget) === appNodeModulesPath) return;
        await rm(workspaceNodeModulesPath);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
          throw cause;
        }
      }

      const relativeTarget = path.relative(workspaceRoot, appNodeModulesPath);
      await symlink(relativeTarget, workspaceNodeModulesPath, "dir");
    },
    catch: (cause) => cause as Error,
  });

const loadWorkspace = (configPath?: string): Effect.Effect<WorkspaceContext, CliError> =>
  Effect.gen(function* () {
    const config = yield* Effect.tryPromise({
      try: () => loadConfig(configPath),
      catch: (cause) => cause as Error,
    });
    const hostApp = resolveHostApp(config.configDir);
    // Only a Turborepo workspace gets per-vault tasks; Svartz never adds Turborepo to a project.
    if (!hostApp && existsSync(path.join(config.configDir, "turbo.json"))) {
      yield* Effect.tryPromise({
        try: () => syncManagedTurboFiles(config),
        catch: (cause) => cause as Error,
      });
    }

    return { config, projectRoot: path.resolve(config.configDir), hostApp };
  });

/** A set of vaults that build or serve together, and the app they run in. */
type AppRun = { readonly location: AppLocation; readonly vaults: readonly ResolvedConfig[] };

/** Every `host` vault, mounted together in the SvelteKit app at the config root. */
const hostRun = (workspace: WorkspaceContext, vaultId?: string): Effect.Effect<AppRun, CliError> =>
  Effect.gen(function* () {
    const vaults = yield* selectHostVaults(workspace.config, vaultId);
    if (!workspace.hostApp) {
      return yield* new CliAppRootMissing({
        appRoot: workspace.projectRoot,
        message: `Vault "${vaults[0]!.id}" targets "host", which mounts it in a SvelteKit app beside svartz.config.ts, and there is none at "${workspace.projectRoot}". Give it another target to build it with the app Svartz ships.`,
      });
    }
    return { location: workspace.hostApp, vaults };
  });

/** The run that builds or serves `vault`: its host app's, or the shipped app with that vault alone. */
const runFor = (workspace: WorkspaceContext, vault: ResolvedConfig): Effect.Effect<AppRun, CliError> =>
  vault.target.type === "host"
    ? hostRun(workspace, vault.id)
    : Effect.map(ensureBuildTargetSupported(vault), (supported) => ({
        location: shippedApp(workspace.projectRoot),
        vaults: [supported],
      }));

/** What `dev` and `preview` serve: `--vault`'s run, or else every host vault in a host app, or else the first vault. */
const serveRun = (workspace: WorkspaceContext, vaultId?: string): Effect.Effect<AppRun, CliError> =>
  Effect.gen(function* () {
    if (!vaultId && workspace.hostApp && workspace.config.vaults.some((vault) => vault.target.type === "host")) {
      return yield* hostRun(workspace);
    }
    return yield* runFor(workspace, yield* selectVault(workspace.config, vaultId));
  });

/** What `build` builds: `--vault`'s run, or every run: the host vaults together, then each other vault alone. */
const buildRuns = (workspace: WorkspaceContext, vaultId?: string): Effect.Effect<readonly AppRun[], CliError> =>
  Effect.gen(function* () {
    if (vaultId) return [yield* runFor(workspace, yield* selectVault(workspace.config, vaultId))];
    const vaults = workspace.config.vaults;
    const host = vaults.some((vault) => vault.target.type === "host") ? [yield* hostRun(workspace)] : [];
    const standalone = yield* Effect.forEach(vaults.filter((vault) => vault.target.type !== "host"), (vault) => runFor(workspace, vault));
    return [...host, ...standalone];
  });

const selectVault = (
  config: ResolvedConfigSet,
  vaultId?: string,
): Effect.Effect<ResolvedConfig, CliVaultNotFound> =>
  Effect.gen(function* () {
    const defaultVaultId = config.vaults[0]?.id;
    const selectedId = vaultId ?? defaultVaultId;

    if (!selectedId) {
      return yield* new CliVaultNotFound({
        vaultId: "<missing>",
        availableVaults: [],
        message: "No vaults are configured in svartz.config.ts.",
      });
    }

    const vault = config.vaults.find((candidate) => candidate.id === selectedId);
    if (!vault) {
      return yield* new CliVaultNotFound({
        vaultId: selectedId,
        availableVaults: config.vaults.map((candidate) => candidate.id),
        message: `Vault "${selectedId}" was not found.`,
      });
    }

    return vault;
  });

const selectHostVaults = (
  config: ResolvedConfigSet,
  vaultId?: string,
): Effect.Effect<readonly ResolvedConfig[], CliVaultNotFound | CliUnsupportedTarget> =>
  Effect.gen(function* () {
    if (vaultId) yield* selectVault(config, vaultId);
    const vaults = config.vaults.filter((vault) => vault.target.type === "host");
    if (vaults.length === 0) {
      return yield* new CliVaultNotFound({
        vaultId: vaultId ?? "<host>",
        availableVaults: [],
        message: "No host vaults are configured. Set target.type to \"host\" for a vault mounted in this app.",
      });
    }
    return vaults;
  });

const loadDevWatchContext = async (
  options: DevOptions,
): Promise<DevWatchContext> => {
  const workspace = await runEffect(loadWorkspace(options.config));
  const { location, vaults } = await runEffect(serveRun(workspace, options.vault));
  const workspaceRoot = workspace.projectRoot;

  const descriptors: WatchDescriptor[] = [
    ...getConfigWatchDescriptors(workspace.config.configDir, options.config),
    ...(location.hostApp
      ? await getViteConfigWatchDescriptors(location.viteConfigPath, location.appRoot)
      : [{ path: location.viteConfigPath, label: "SvelteKit Vite config", exact: true }]),
    ...(!location.hostApp ? createWorkspaceSourceWatchDescriptors(workspaceRoot) : []),
  ];

  for (const vault of vaults) {
    for (const themeBase of resolveThemeModuleIds(vault)) {
      descriptors.push(...getThemeWatchDescriptors(themeBase, workspaceRoot, workspaceRoot, location.hostApp));
    }
  }

  return {
    workspace,
    workspaceRoot,
    descriptors: dedupeWatchDescriptors(descriptors),
  };
};

const ensureBuildTargetSupported = (
  vault: ResolvedConfig,
): Effect.Effect<ResolvedConfig, CliUnsupportedTarget> =>
  ["static", "node", "cloudflare-pages", "cloudflare-workers"].includes(vault.target.type)
    ? Effect.succeed(vault)
    : new CliUnsupportedTarget({
        vaultId: vault.id,
        targetType: String(vault.target.type),
        message: `Vault "${vault.id}" targets "${String(vault.target.type)}". The CLI currently supports static, node, cloudflare-pages, and cloudflare-workers targets.`,
      });

const createAppConfig = (
  { location, vaults }: AppRun,
  mode: "development" | "production",
  command: "serve" | "build",
  serverOptions?: Partial<ServerOptions>,
): Effect.Effect<InlineConfig, CliError> =>
  Effect.gen(function* () {
    const { appRoot, projectRoot, hostApp, viteConfigPath } = location;
    const vault = vaults[0]!;
    yield* Effect.forEach(vaults, (item) => ensureVaultWorkspace(appRoot, item), { concurrency: 1 });
    process.chdir(appRoot);
    if (!hostApp) applyPlatformEnvForVault(vault);
    const wranglerConfig = hostApp || vault.target.type !== "cloudflare-workers"
      ? undefined
      : yield* Effect.tryPromise({ try: () => writeVaultWranglerConfig(vault), catch: (cause) => cause as Error });
    if (wranglerConfig) process.env["SVARTZ_WRANGLER_CONFIG"] = wranglerConfig;
    else delete process.env["SVARTZ_WRANGLER_CONFIG"];
    process.env["SVARTZ_OUT_DIR"] = vault.outDir;
    process.env["SVARTZ_PROJECT_ROOT"] = projectRoot;
    if (hostApp) delete process.env["SVARTZ_KIT_OUT_DIR"];
    else process.env["SVARTZ_KIT_OUT_DIR"] = kitOutDirForVault(vault);
    process.env["SVARTZ_BASE_PATH"] = basePathForVault(vault);
    if (hostApp) delete process.env["SVARTZ_TARGET_TYPE"];
    else process.env["SVARTZ_TARGET_TYPE"] = vault.target.type;
    process.env["SVARTZ_THEME_MODULE_PATH"] = getGeneratedRuntimeThemeModulePath(vault);
    process.env["SVARTZ_ARTIFACTS_MODULE_PATH"] = getGeneratedRuntimeArtifactsModulePath(vault);
    // A host app reads its registry from the project; a standalone vault keeps its own, so neither overwrites the other.
    const registryRoot = hostApp ? projectRoot : getVaultBuildRoot(vault);
    const hostRegistryPath = getGeneratedHostRegistryPath(registryRoot);
    const hostServerPath = getGeneratedHostServerPath(registryRoot);
    const hostIndexPath = getGeneratedHostIndexPath(registryRoot);
    process.env["SVARTZ_HOST_MODULE_PATH"] = hostRegistryPath;
    process.env["SVARTZ_INDEX_MODULE_PATH"] = hostIndexPath;
    const styleManifests = vaults.map((item) => ({
      modules: [getGeneratedRuntimeArtifactsModulePath(item), getGeneratedRuntimeThemeModulePath(item)],
      pagesRoot: getGeneratedPagesRoot(item),
      path: getGeneratedHostStylesPath(hostRegistryPath, item.id),
    }));
    const standalonePluginPath = path.join(path.dirname(hostRegistryPath), "standalone-vite-plugin.mjs");
    process.env["SVARTZ_HOST_STYLE_MAP"] = JSON.stringify(styleManifests);
    if (hostApp) delete process.env["SVARTZ_VITE_PLUGINS_MODULE_PATH"];
    else process.env["SVARTZ_VITE_PLUGINS_MODULE_PATH"] = `${pathToFileURL(standalonePluginPath).href}?build=${randomUUID()}`;
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(path.dirname(hostRegistryPath), { recursive: true });
        await Promise.all(vaults.map(async (vault) => {
          const stylesPath = getGeneratedHostStylesPath(hostRegistryPath, vault.id);
          await mkdir(path.dirname(stylesPath), { recursive: true });
          await writeFile(stylesPath, '{"shared":[],"notes":{}}\n');
        }));
        await writeFile(hostRegistryPath, createHostRegistrySource(vaults));
        await writeFile(hostIndexPath, createHostIndexSource(vaults));
        if (hostApp) await writeFile(hostServerPath, createHostServerSource(vaults));
        if (!hostApp) await writeFile(standalonePluginPath, [
          `import { hostStylesPlugin, publicAssetsPlugin } from ${JSON.stringify(import.meta.resolve("@svartz/vite/host"))};`,
          `export { withMarkdownNegotiation } from ${JSON.stringify(import.meta.resolve("@svartz/vite/host"))};`,
          `export default [hostStylesPlugin(${JSON.stringify(styleManifests)}), publicAssetsPlugin()];`,
        ].join("\n"));
      },
      catch: (cause) => cause as Error,
    });
    const themes = vaults.flatMap((item) => resolveThemeModuleIds(item).flatMap((id) => {
      const root = resolveThemePackageRoot(id, projectRoot);
      return root ? [{ id, root }] : [];
    }));
    const themeRoots = themes.map(({ root }) => root);
    // A lone vault loads its workspace themes from source, so theme edits need no rebuild.
    const themeSources = vaults.length === 1
      ? Object.fromEntries(themes.flatMap(({ id, root }) => {
          const source = path.join(root, "src", "lib", "index.ts");
          return isLocalWorkspacePackage(root, projectRoot) && existsSync(source) ? [[id, source]] : [];
        }))
      : {};
    process.env["SVARTZ_THEME_SOURCES"] = JSON.stringify(themeSources);

    process.env["SVARTZ_TAILWIND_SOURCES_PATH"] = yield* Effect.tryPromise({
      try: () => vaults.length === 1
        ? writeGeneratedTailwindSourcesFile(projectRoot, vault, hostApp)
        : writeGeneratedHostTailwindSourcesFile(projectRoot, projectRoot, vaults),
      catch: (cause) => cause as Error,
    });

    const loaded = yield* Effect.tryPromise({
      try: () =>
        loadConfigFromFile(
          { command, mode },
          viteConfigPath,
          appRoot,
          undefined,
          undefined,
          // The shipped app's config is plain JavaScript; loading it natively writes nothing beside it in the install.
          hostApp ? undefined : "native",
        ),
      catch: (cause) => cause as Error,
    });

    if (!loaded) {
      return yield* new CliViteConfigMissing({
        path: viteConfigPath,
        message: `Could not load ${viteConfigPath}.`,
      });
    }

    const inlineConfig: InlineConfig = {
      root: appRoot,
      configFile: false,
      mode,
      // The shipped app lives in the project's install; Vite's cache belongs with the vault's build instead.
      ...(hostApp ? {} : { cacheDir: path.join(getVaultBuildRoot(vault), ".vite") }),
      // Workspace packages resolve compatible Vite runtimes at runtime, but their
      // published type graphs can diverge slightly inside the monorepo.
      plugins: [
        ...vaults.map((item) => svartz({
          config: item,
          mode,
          projectRoot,
          ...(wranglerConfig ? { wranglerDir: path.dirname(wranglerConfig) } : {}),
          exposeVirtualModules: vaults.length === 1,
        }) as never),
        {
          name: "svartz:host-registry-base",
          async configResolved(resolved) {
            const kitPaths = svelteKitPaths(resolved.define) ?? { base: "", assets: "" };
            await writeFile(hostRegistryPath, createHostRegistrySource(vaults, kitPaths));
            await writeFile(hostIndexPath, createHostIndexSource(vaults, kitPaths.base));
          },
        },
      ],
      resolve: {
        // A project's theme and the shipped app must share one Svelte runtime and one copy of Svartz's components.
        ...(hostApp ? {} : { dedupe: ["svelte", "@sveltejs/kit", "@svartz/ui"] }),
        alias: {
          "virtual:svartz/host": hostRegistryPath,
          "virtual:svartz/index": hostIndexPath,
          // The standalone shell's `virtual:svartz/server` is its one vault's module, aliased by the svartz plugin.
          ...(hostApp ? { "virtual:svartz/server": hostServerPath } : {}),
        },
      },
      server: {
        fs: {
          allow: [projectRoot, ...themeRoots],
        },
        ...serverOptions,
      },
    };

    return mergeConfig(loaded.config, inlineConfig);
  });

const buildRun = (workspace: WorkspaceContext, run: AppRun): Effect.Effect<void, CliError> =>
  Effect.tryPromise({
    try: () =>
      withVaultBuildLock(workspace.projectRoot, async () => {
        // Standalone vaults build one after another in this process.
        clearPublicAssets();
        const config = await runEffect(createAppConfig(run, "production", "build"));
        // `vite build` builds the app: SvelteKit 3 builds its server, prerenders, and adapts only in `buildApp`.
        // `null` keeps Vite's own choice of builder, so SvelteKit 2's single build is unchanged.
        await (await createBuilder(config, null)).buildApp();
      }),
    catch: (cause) => cause as Error,
  });

const devRun = (run: AppRun, options: DevOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const serverOptions: Partial<ServerOptions> = {};

    if (options.host) serverOptions.host = options.host;
    if (options.port) serverOptions.port = Number(options.port);

    const config = yield* createAppConfig(run, "development", "serve", serverOptions);

    const server = yield* Effect.tryPromise({
      try: () => createServer(config),
      catch: (cause) => cause as Error,
    });

    yield* Effect.tryPromise({
      try: async () => {
        await server.listen();
        server.printUrls();
      },
      catch: (cause) => cause as Error,
    });
  });

const previewRun = (run: AppRun, options: PreviewOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const config = yield* createAppConfig(run, "production", "build");
    // base is set via SVARTZ_BASE_PATH → the app's SvelteKit `paths.base`; SvelteKit
    // overrides Vite's base, so merging base here would trigger the override warning.
    const previewConfig = mergeConfig(config, {
      ...(run.location.hostApp ? {} : { build: { outDir: run.vaults[0]!.outDir } }),
      preview: {
        ...(options.host && { host: options.host }),
        ...(options.port && { port: Number(options.port) }),
      },
    });
    const previewServer = yield* Effect.tryPromise({
      try: () => vitePreview(previewConfig),
      catch: (cause) => cause as Error,
    });
    previewServer.printUrls();
  });

const previewCommand = (options: PreviewOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    yield* previewRun(yield* serveRun(workspace, options.vault), options);
  });

const devRunnerCommand = (options: DevOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    yield* devRun(yield* serveRun(workspace, options.vault), options);
  });

const runDevSupervisor = async (options: DevOptions): Promise<void> => {
  let watchContext = await loadDevWatchContext(options);
  let watcher = createDevWatcher(watchContext.descriptors, requestRestart);
  let child = startDevRunnerChild(options);
  let shuttingDown = false;
  let restarting = false;
  let watcherPaused = false;
  let pendingDescriptors: WatchDescriptor[] = [];
  let monitorRunner: (runner: ChildProcess) => void = () => {};

  function requestRestart(
    changedPath: string,
    descriptors: readonly WatchDescriptor[],
  ): void {
    if (shuttingDown) return;
    const labels = descriptors.map((descriptor) => descriptor.label).join(", ");
    console.log(`[svartz:dev] restarting after ${changedPath} (${labels})`);
    pendingDescriptors.push(...descriptors);
    if (watcherPaused) return;
    void flushRestartQueue().catch((cause) => console.error("[svartz:dev] restart failed:", cause));
  }

  async function flushRestartQueue(): Promise<void> {
    if (restarting || shuttingDown || pendingDescriptors.length === 0) return;
    restarting = true;
    watcherPaused = true;

    try {
      const restartBatch = pendingDescriptors;
      pendingDescriptors = [];
      await watcher.close();

      const buildFilters = restartBatch.flatMap(
        (descriptor) => descriptor.buildFilters ?? [],
      );
      if (buildFilters.length > 0) {
        await buildWorkspacePackages(watchContext.workspaceRoot, buildFilters);
      }
      const buildDirectories = [...new Set(restartBatch.flatMap(
        (descriptor) => descriptor.buildDirectory ?? [],
      ))];
      if (buildDirectories.length > 0) {
        const manifest = JSON.parse(await readFile(path.join(watchContext.workspaceRoot, "package.json"), "utf8")) as { packageManager?: string };
        const manager = commandExecutable(packageManager(watchContext.workspaceRoot, manifest));
        for (const directory of buildDirectories) {
          await runCommand(manager, ["run", "build"], directory);
        }
      }

      const nextContext = await loadDevWatchContext(options);
      if (shuttingDown) return;
      await stopDevRunnerChild(child);
      if (shuttingDown) return;
      watchContext = nextContext;
      watcher = createDevWatcher(watchContext.descriptors, requestRestart);
      child = startDevRunnerChild(options);
      monitorRunner(child);
    } catch (cause) {
      console.error("[svartz:dev] rebuild failed; waiting for another edit:", cause);
      if (!shuttingDown) watcher = createDevWatcher(watchContext.descriptors, requestRestart);
    } finally {
      watcherPaused = false;
      restarting = false;
      if (!shuttingDown && pendingDescriptors.length > 0) {
        void flushRestartQueue().catch((cause) => console.error("[svartz:dev] restart failed:", cause));
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = async (exitCode?: number) => {
      if (shuttingDown) return;
      shuttingDown = true;

      try {
        await watcher.close();
        await stopDevRunnerChild(child);
      } catch (cause) {
        reject(cause);
        return;
      }

      if (typeof exitCode === "number") {
        process.exitCode = exitCode;
      }
      resolve();
    };

    const onSignal = (signal: NodeJS.Signals) => {
      void cleanup(signal === "SIGINT" ? 130 : 143);
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    monitorRunner = (runner) => {
      runner.on("error", (cause) => {
        if (runner !== child) return;
        void cleanup();
        reject(cause);
      });

      runner.on("exit", (code, signal) => {
        if (runner !== child || shuttingDown || restarting) return;
        void watcher.close();

        if (signal) {
          reject(new Error(`svartz dev runner exited due to signal ${signal}`));
          return;
        }
        if ((code ?? 0) !== 0) {
          reject(new Error(`svartz dev runner exited with code ${String(code)}`));
          return;
        }
        resolve();
      });
    };
    monitorRunner(child);
  });
};

const buildCommand = (options: BuildOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    const runs = yield* buildRuns(workspace, options.vault);
    yield* Effect.forEach(runs, (run) => buildRun(workspace, run), { concurrency: 1 });
  });

const devCommand = (options: DevOptions): Effect.Effect<void, CliError> =>
  Effect.tryPromise({
    try: () => runDevSupervisor(options),
    catch: (cause) => cause as Error,
  });

function createProgram(): Command {
  const program = new Command();

  program
    .name("svartz")
    .description("Build and serve static Svartz vault sites")
    .showHelpAfterError();

  program
    .command("init")
    .description("Initialize Svartz in the current directory")
    .option("--no-install", "Write the project without installing dependencies")
    .option("--no-git", "Do not initialize a Git repository")
    .action(async (options: { install: boolean; git: boolean }) => {
      const result = await initProject(options);
      if (result.kind === "already-configured") {
        console.log("Svartz is already configured here. No files changed.");
        return;
      }
      console.log(result.kind === "created" ? "Created a Svartz site." : "Added Svartz to this SvelteKit app.");
      const script = result.kind === "created" ? "dev" : "svartz:dev";
      console.log(`Run ${result.packageManager} run ${script} to start the vault.`);
    });

  program
    .command("build")
    .description("Build all vaults, or one vault with --vault")
    .option("--config <path>", "Path to svartz.config.ts")
    .option("--vault <id>", "Vault ID to build")
    .action(async (options: BuildOptions) => {
      await runEffect(buildCommand(options));
    });

  program
    .command("build:all")
    .description("Build all configured vaults")
    .option("--config <path>", "Path to svartz.config.ts")
    .action(async (options: SharedOptions) => {
      await runEffect(buildCommand(options));
    });

  program
    .command("dev")
    .description("Run a standalone vault or all vaults in a SvelteKit host")
    .option("--config <path>", "Path to svartz.config.ts")
    .option("--vault <id>", "Vault ID to serve")
    .option("--host <host>", "Dev server host")
    .option("--port <port>", "Dev server port")
    .action(async (options: DevOptions) => {
      await runEffect(devCommand(options));
    });

  program
    .command("preview")
    .description("Serve built output (run build first)")
    .option("--config <path>", "Path to svartz.config.ts")
    .option("--vault <id>", "Vault ID to preview")
    .option("--host <host>", "Preview server host")
    .option("--port <port>", "Preview server port")
    .action(async (options: PreviewOptions) => {
      await runEffect(previewCommand(options));
    });

  program
    .command("dev:runner")
    .description("Internal dev runner")
    .option("--config <path>", "Path to svartz.config.ts")
    .option("--vault <id>", "Vault ID to serve")
    .option("--host <host>", "Dev server host")
    .option("--port <port>", "Dev server port")
    .action(async (options: DevOptions) => {
      await runEffect(devRunnerCommand(options));
    });

  program
    .command("run-managed-task <taskName>")
    .description(
      "Run a Turbo root task by name (used by synced svartz:build script; no-op when TURBO_HASH is set)",
    )
    .action((taskName: string) => {
      if (!taskName) {
        console.error("Expected a Turbo task name.");
        process.exitCode = 1;
        return;
      }
      if (process.env["TURBO_HASH"]) {
        process.exit(0);
      }
      const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      const result = spawnSync(command, ["exec", "turbo", "run", taskName], {
        stdio: "inherit",
        env: process.env,
      });
      if (result.error) {
        throw result.error;
      }
      process.exitCode = result.status ?? 0;
    });

  return program;
}

async function main(argv = process.argv): Promise<void> {
  const program = createProgram();
  const finalArgv = argv.length > 2 ? argv : [...argv, "build"];
  await program.parseAsync(finalArgv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
