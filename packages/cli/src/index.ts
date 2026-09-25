#!/usr/bin/env node

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar, { type FSWatcher } from "chokidar";
import { Command } from "commander";
import { Data, Effect, Either } from "effect";
import {
  loadConfig,
  type ResolvedConfig,
  type ResolvedConfigSet,
} from "@svartz/config";
import {
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
  createHostRegistrySource,
  getGeneratedHostStylesPath,
  getGeneratedHostRegistryPath,
  svelteKitBasePath,
  getVaultBuildRoot,
  resolveThemePackageRoot,
  svartz,
} from "@svartz/vite";
import {
  build as viteBuild,
  createServer,
  loadConfigFromFile,
  mergeConfig,
  preview as vitePreview,
  type InlineConfig,
  type ServerOptions,
} from "vite";
import {
  createWorkspaceSourceWatchDescriptors,
  getThemeWatchDescriptors,
  getConfigWatchDescriptors,
  getViteConfigWatchDescriptors,
  isLocalWorkspacePackage,
  matchesWatchDescriptor,
  uniqBuildFilters,
  type WatchDescriptor,
} from "./dev-watch";
import { writeGeneratedHostTailwindSourcesFile, writeGeneratedTailwindSourcesFile } from "./tailwind-sources";
import { syncManagedTurboFiles } from "./turbo-sync";
import { resolveAppLocation, type AppLocation } from "./workspace";
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

type WorkspaceContext = AppLocation & {
  readonly config: ResolvedConfigSet;
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

const ensureVaultWorkspace = (
  appRoot: string,
  vault: ResolvedConfig,
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const workspaceRoot = getVaultBuildRoot(vault);
      const workspaceNodeModulesPath = path.join(workspaceRoot, "node_modules");
      const appNodeModulesPath = path.join(appRoot, "node_modules");

      await mkdir(workspaceRoot, { recursive: true });

      try {
        const existing = await lstat(workspaceNodeModulesPath);
        if (existing.isSymbolicLink()) {
          const currentTarget = await readlink(workspaceNodeModulesPath);
          const resolvedTarget = path.resolve(workspaceRoot, currentTarget);
          if (resolvedTarget === appNodeModulesPath) {
            return;
          }
        }

        await rm(workspaceNodeModulesPath, { recursive: true, force: true });
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

const ensureVaultKitSymlink = (
  appRoot: string,
  vault: ResolvedConfig,
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const vaultKitDir = path.join(getVaultBuildRoot(vault), ".svelte-kit");
      await mkdir(vaultKitDir, { recursive: true });

      const appKitPath = path.join(appRoot, ".svelte-kit");
      try {
        const existing = await lstat(appKitPath);
        if (existing.isSymbolicLink()) {
          const currentTarget = await readlink(appKitPath);
          const resolvedTarget = path.resolve(appRoot, currentTarget);
          if (resolvedTarget === vaultKitDir) return;
        }
        await rm(appKitPath, { recursive: true, force: true });
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
          throw cause;
        }
      }

      const relativeTarget = path.relative(appRoot, vaultKitDir);
      await symlink(relativeTarget, appKitPath, "dir");
    },
    catch: (cause) => cause as Error,
  });

const removeVaultKitSymlink = async (
  appRoot: string,
  vault: ResolvedConfig,
): Promise<void> => {
  const appKitPath = path.join(appRoot, ".svelte-kit");
  try {
    const existing = await lstat(appKitPath);
    if (!existing.isSymbolicLink()) return;
    const resolvedTarget = path.resolve(appRoot, await readlink(appKitPath));
    if (resolvedTarget === kitOutDirForVault(vault)) {
      await rm(appKitPath, { force: true });
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
  }
};

const ensureDirectory = (directory: string) =>
  Effect.tryPromise({
    try: async () => {
      const info = await stat(directory);
      return info.isDirectory();
    },
    catch: () =>
      new CliAppRootMissing({
        appRoot: directory,
        message: `Expected app root at "${directory}" but it does not exist.`,
      }),
  }).pipe(
    Effect.flatMap((isDirectory) =>
      isDirectory
        ? Effect.succeed(directory)
        : new CliAppRootMissing({
            appRoot: directory,
            message: `Expected "${directory}" to be a directory.`,
          }),
    ),
  );

const loadWorkspace = (configPath?: string): Effect.Effect<WorkspaceContext, CliError> =>
  Effect.gen(function* () {
    const config = yield* Effect.tryPromise({
      try: () => loadConfig(configPath),
      catch: (cause) => cause as Error,
    });
    const location = resolveAppLocation(config.configDir);
    if (!location.hostApp) {
      yield* Effect.tryPromise({
        try: () => syncManagedTurboFiles(config),
        catch: (cause) => cause as Error,
      });
    }
    yield* ensureDirectory(location.appRoot);

    return { config, ...location };
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
    if (vaultId) {
      const selected = yield* selectVault(config, vaultId);
      if (selected.target.type !== "host") {
        return yield* new CliUnsupportedTarget({
          vaultId: selected.id,
          targetType: selected.target.type,
          message: `Vault "${selected.id}" targets "${selected.target.type}" and cannot be mounted in a host app. Set target.type to "host".`,
        });
      }
    }
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
  const vaults = workspace.hostApp
    ? await runEffect(selectHostVaults(workspace.config, options.vault))
    : [await runEffect(selectVault(workspace.config, options.vault))];
  const workspaceRoot = workspace.projectRoot;

  const descriptors: WatchDescriptor[] = [
    ...getConfigWatchDescriptors(workspace.config.configDir, options.config),
    ...(workspace.hostApp
      ? await getViteConfigWatchDescriptors(workspace.viteConfigPath, workspace.appRoot)
      : [{ path: workspace.viteConfigPath, label: "SvelteKit Vite config", exact: true }]),
    ...(!workspace.hostApp ? createWorkspaceSourceWatchDescriptors(workspaceRoot) : []),
  ];

  for (const vault of vaults) {
    descriptors.push(...getThemeWatchDescriptors(vault.theme.base, workspace.appRoot, workspaceRoot, workspace.hostApp));
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
  workspace: WorkspaceContext,
  vaults: readonly ResolvedConfig[],
  mode: "development" | "production",
  command: "serve" | "build",
  serverOptions?: Partial<ServerOptions>,
): Effect.Effect<InlineConfig, CliError> =>
  Effect.gen(function* () {
    const { appRoot, projectRoot, hostApp, viteConfigPath } = workspace;
    const vault = vaults[0]!;
    yield* Effect.forEach(vaults, (item) => ensureVaultWorkspace(appRoot, item), { concurrency: 1 });
    if (!hostApp) yield* ensureVaultKitSymlink(appRoot, vault);
    process.chdir(appRoot);
    if (!hostApp) applyPlatformEnvForVault(vault);
    process.env["SVARTZ_OUT_DIR"] = vault.outDir;
    if (hostApp) delete process.env["SVARTZ_KIT_OUT_DIR"];
    else process.env["SVARTZ_KIT_OUT_DIR"] = kitOutDirForVault(vault);
    process.env["SVARTZ_BASE_PATH"] = basePathForVault(vault);
    if (hostApp) delete process.env["SVARTZ_TARGET_TYPE"];
    else process.env["SVARTZ_TARGET_TYPE"] = vault.target.type;
    process.env["SVARTZ_THEME_MODULE_PATH"] = getGeneratedRuntimeThemeModulePath(vault);
    process.env["SVARTZ_ARTIFACTS_MODULE_PATH"] = getGeneratedRuntimeArtifactsModulePath(vault);
    const hostRegistryPath = getGeneratedHostRegistryPath(projectRoot);
    process.env["SVARTZ_HOST_MODULE_PATH"] = hostRegistryPath;
    const styleManifests = vaults.map((item) => ({
      modules: [getGeneratedRuntimeArtifactsModulePath(item), getGeneratedRuntimeThemeModulePath(item)],
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
          await writeFile(stylesPath, "[]\n");
        }));
        await writeFile(hostRegistryPath, createHostRegistrySource(vaults));
        if (!hostApp) await writeFile(standalonePluginPath, [
          `import { hostStylesPlugin } from ${JSON.stringify(import.meta.resolve("@svartz/vite/host"))};`,
          `export default hostStylesPlugin(${JSON.stringify(styleManifests)});`,
        ].join("\n"));
      },
      catch: (cause) => cause as Error,
    });
    const themeRoots = vaults.flatMap((item) => resolveThemePackageRoot(item.theme.base, appRoot) ?? []);
    const themeRoot = themeRoots[0];
    const workspaceRoot = projectRoot;
    const themeSourceCandidate = themeRoot
      ? path.join(themeRoot, "src", "lib", "index.ts")
      : "";
    if (
      vaults.length === 1 && themeRoot &&
      isLocalWorkspacePackage(themeRoot, workspaceRoot) &&
      themeSourceCandidate &&
      existsSync(themeSourceCandidate)
    ) {
      process.env["SVARTZ_THEME_SOURCE_PATH"] = themeSourceCandidate;
      process.env["SVARTZ_THEME_SOURCE_ID"] = vault.theme.base;
    } else {
      delete process.env["SVARTZ_THEME_SOURCE_PATH"];
      delete process.env["SVARTZ_THEME_SOURCE_ID"];
    }

    process.env["SVARTZ_TAILWIND_SOURCES_PATH"] = yield* Effect.tryPromise({
      try: () => vaults.length === 1
        ? writeGeneratedTailwindSourcesFile(appRoot, vault, hostApp)
        : writeGeneratedHostTailwindSourcesFile(appRoot, projectRoot, vaults),
      catch: (cause) => cause as Error,
    });

    const loaded = yield* Effect.tryPromise({
      try: () =>
        loadConfigFromFile(
          { command, mode },
          viteConfigPath,
          appRoot,
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
      // Workspace packages resolve compatible Vite runtimes at runtime, but their
      // published type graphs can diverge slightly inside the monorepo.
      plugins: [
        ...vaults.map((item) => svartz({ config: item, mode, exposeVirtualModules: vaults.length === 1 }) as never),
        {
          name: "svartz:host-registry-base",
          async configResolved(resolved) {
            if (!hostApp) return;
            const kitBasePath = svelteKitBasePath(resolved.define) ?? "";
            await writeFile(hostRegistryPath, createHostRegistrySource(vaults, kitBasePath));
          },
        },
      ],
      resolve: { alias: { "virtual:svartz/host": hostRegistryPath } },
      server: {
        fs: {
          allow: [workspaceRoot, ...themeRoots],
        },
        ...serverOptions,
      },
    };

    return mergeConfig(loaded.config, inlineConfig);
  });

const buildVaults = (
  workspace: WorkspaceContext,
  vaults: readonly ResolvedConfig[],
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const supportedVaults = workspace.hostApp
      ? vaults
      : yield* Effect.forEach(vaults, ensureBuildTargetSupported);
    yield* Effect.tryPromise({
      try: () =>
        withVaultBuildLock(workspace.projectRoot, async () => {
          try {
            const config = await runEffect(
              createAppConfig(workspace, supportedVaults, "production", "build"),
            );
            await viteBuild(config);
          } finally {
            if (!workspace.hostApp) await removeVaultKitSymlink(workspace.appRoot, supportedVaults[0]!);
          }
        }),
      catch: (cause) => cause as Error,
    });
  });

const devVaults = (
  workspace: WorkspaceContext,
  vaults: readonly ResolvedConfig[],
  options: DevOptions,
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const supportedVaults = workspace.hostApp
      ? vaults
      : yield* Effect.forEach(vaults, ensureBuildTargetSupported);
    const serverOptions: Partial<ServerOptions> = {};

    if (options.host) serverOptions.host = options.host;
    if (options.port) serverOptions.port = Number(options.port);

    const config = yield* createAppConfig(
      workspace,
      supportedVaults,
      "development",
      "serve",
      serverOptions,
    );

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

const previewVaults = (
  workspace: WorkspaceContext,
  vaults: readonly ResolvedConfig[],
  options: PreviewOptions,
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const supportedVaults = workspace.hostApp
      ? vaults
      : yield* Effect.forEach(vaults, ensureBuildTargetSupported);
    const config = yield* createAppConfig(
      workspace,
      supportedVaults,
      "production",
      "build",
    );
    // base is set via SVARTZ_BASE_PATH → svelte.config.js kit.paths.base; SvelteKit
    // overrides Vite's base, so merging base here would trigger the override warning.
    const previewConfig = mergeConfig(config, {
      ...(workspace.hostApp ? {} : { build: { outDir: supportedVaults[0]!.outDir } }),
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
    const vaults = workspace.hostApp
      ? yield* selectHostVaults(workspace.config, options.vault)
      : [yield* selectVault(workspace.config, options.vault)];
    yield* previewVaults(workspace, vaults, options);
  });

const createDevWatcher = (
  context: DevWatchContext,
  onRestartRequested: (
    changedPath: string,
    descriptors: readonly WatchDescriptor[],
  ) => void,
): FSWatcher => {
  const watcher = chokidar.watch(context.descriptors.map((descriptor) => descriptor.path), {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  watcher.on("all", (_eventName, changedPath) => {
    const matchingDescriptors = context.descriptors.filter((descriptor) =>
      matchesWatchDescriptor(changedPath, descriptor),
    );
    if (matchingDescriptors.length === 0) return;
    onRestartRequested(changedPath, matchingDescriptors);
  });

  return watcher;
};

const devRunnerCommand = (options: DevOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    const vaults = workspace.hostApp
      ? yield* selectHostVaults(workspace.config, options.vault)
      : [yield* selectVault(workspace.config, options.vault)];
    yield* devVaults(workspace, vaults, options);
  });

const runDevSupervisor = async (options: DevOptions): Promise<void> => {
  let watchContext = await loadDevWatchContext(options);
  let watcher = createDevWatcher(watchContext, requestRestart);
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
        const manifest = JSON.parse(await readFile(path.join(watchContext.workspace.appRoot, "package.json"), "utf8")) as { packageManager?: string };
        const manager = commandExecutable(packageManager(watchContext.workspace.appRoot, manifest));
        for (const directory of buildDirectories) {
          await runCommand(manager, ["run", "build"], directory);
        }
      }

      const nextContext = await loadDevWatchContext(options);
      if (shuttingDown) return;
      await stopDevRunnerChild(child);
      if (shuttingDown) return;
      watchContext = nextContext;
      watcher = createDevWatcher(watchContext, requestRestart);
      child = startDevRunnerChild(options);
      monitorRunner(child);
    } catch (cause) {
      console.error("[svartz:dev] rebuild failed; waiting for another edit:", cause);
      if (!shuttingDown) watcher = createDevWatcher(watchContext, requestRestart);
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
    if (workspace.hostApp) {
      yield* buildVaults(workspace, yield* selectHostVaults(workspace.config, options.vault));
      return;
    }
    if (options.vault) {
      const vault = yield* selectVault(workspace.config, options.vault);
      yield* buildVaults(workspace, [vault]);
      return;
    }

    yield* Effect.forEach(
      workspace.config.vaults,
      (vault) => buildVaults(workspace, [vault]),
      { concurrency: 1 },
    );
  });

const buildAllCommand = (options: SharedOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    if (workspace.hostApp) {
      yield* buildVaults(workspace, yield* selectHostVaults(workspace.config));
      return;
    }
    yield* Effect.forEach(
      workspace.config.vaults,
      (vault) => buildVaults(workspace, [vault]),
      { concurrency: 1 },
    );
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
      await runEffect(buildAllCommand(options));
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
