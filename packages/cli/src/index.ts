#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readlink, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar, { type FSWatcher } from "chokidar";
import { Command } from "commander";
import { Data, Effect, Either } from "effect";
import {
  loadConfig,
  type ResolvedConfig,
  type ResolvedConfigSet,
} from "@svartz/config";
import {
  getGeneratedArtifactsRoot,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
  getVaultBuildRoot,
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
  findPackageRootForModule,
  getConfigWatchDescriptors,
  matchesWatchDescriptor,
  uniqBuildFilters,
  type WatchDescriptor,
} from "./dev-watch";

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
  readonly appRoot: string;
};

type DevWatchContext = {
  readonly workspace: WorkspaceContext;
  readonly vault: ResolvedConfig;
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

const workspaceRootFromAppRoot = (appRoot: string): string =>
  path.resolve(appRoot, "../..");

const isWithinDirectory = (targetPath: string, directory: string): boolean => {
  const relativePath = path.relative(path.resolve(directory), path.resolve(targetPath));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
};

const dedupeWatchDescriptors = (
  descriptors: readonly WatchDescriptor[],
): WatchDescriptor[] => {
  const seen = new Set<string>();
  const deduped: WatchDescriptor[] = [];

  for (const descriptor of descriptors) {
    const key = `${descriptor.path}:${descriptor.exact ? "exact" : "dir"}:${(descriptor.buildFilters ?? []).join(",")}`;
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

    const appRoot = path.join(config.configDir, "apps/web");
    yield* ensureDirectory(appRoot);

    return { config, appRoot };
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

const loadDevWatchContext = async (
  options: DevOptions,
): Promise<DevWatchContext> => {
  const workspace = await runEffect(loadWorkspace(options.config));
  const vault = await runEffect(selectVault(workspace.config, options.vault));
  const workspaceRoot = workspaceRootFromAppRoot(workspace.appRoot);

  const descriptors: WatchDescriptor[] = [
    ...getConfigWatchDescriptors(workspace.config.configDir, options.config),
    {
      path: path.join(workspace.appRoot, "vite.config.ts"),
      label: "apps/web vite config",
      exact: true,
    },
    ...createWorkspaceSourceWatchDescriptors(workspaceRoot),
  ];

  const themeRoot = findPackageRootForModule(vault.theme.base);
  if (themeRoot) {
    const buildFilters = isWithinDirectory(themeRoot, workspaceRoot)
      ? [vault.theme.base]
      : undefined;

    descriptors.push({
      path: path.join(themeRoot, "src"),
      label: `${vault.theme.base} source`,
      buildFilters,
    });
    descriptors.push({
      path: path.join(themeRoot, "package.json"),
      label: `${vault.theme.base} package`,
      exact: true,
      buildFilters,
    });
  }

  return {
    workspace,
    vault,
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
  appRoot: string,
  vault: ResolvedConfig,
  mode: "development" | "production",
  command: "serve" | "build",
  serverOptions?: Partial<ServerOptions>,
): Effect.Effect<InlineConfig, CliError> =>
  Effect.gen(function* () {
    yield* ensureVaultWorkspace(appRoot, vault);
    yield* ensureVaultKitSymlink(appRoot, vault);
    process.chdir(appRoot);
    applyPlatformEnvForVault(vault);
    process.env["SVARTZ_OUT_DIR"] = vault.outDir;
    process.env["SVARTZ_KIT_OUT_DIR"] = kitOutDirForVault(vault);
    process.env["SVARTZ_BASE_PATH"] = basePathForVault(vault);
    process.env["SVARTZ_TARGET_TYPE"] = vault.target.type;
    process.env["SVARTZ_THEME_MODULE_PATH"] = getGeneratedRuntimeThemeModulePath(vault);
    process.env["SVARTZ_ARTIFACTS_MODULE_PATH"] = getGeneratedRuntimeArtifactsModulePath(vault);
    const themeRoot = findPackageRootForModule(vault.theme.base);
    const themeSourceCandidate = themeRoot
      ? path.join(themeRoot, "src", "lib", "index.ts")
      : "";
    if (themeSourceCandidate && existsSync(themeSourceCandidate)) {
      process.env["SVARTZ_THEME_SOURCE_PATH"] = themeSourceCandidate;
    } else {
      delete process.env["SVARTZ_THEME_SOURCE_PATH"];
    }

    const loaded = yield* Effect.tryPromise({
      try: () =>
        loadConfigFromFile(
          { command, mode },
          path.join(appRoot, "vite.config.ts"),
          appRoot,
        ),
      catch: (cause) => cause as Error,
    });

    if (!loaded) {
      return yield* new CliViteConfigMissing({
        path: path.join(appRoot, "vite.config.ts"),
        message: "Could not load apps/web/vite.config.ts.",
      });
    }

    const inlineConfig: InlineConfig = {
      root: appRoot,
      configFile: false,
      mode,
      // Workspace packages resolve compatible Vite runtimes at runtime, but their
      // published type graphs can diverge slightly inside the monorepo.
      plugins: [svartz({ config: vault, mode }) as never],
      server: {
        fs: {
          allow: [path.resolve(appRoot, "../..")],
        },
        ...serverOptions,
      },
    };

    return mergeConfig(loaded.config, inlineConfig);
  });

const copyVaultAssets = (vault: ResolvedConfig): Effect.Effect<void, CliError> =>
  Effect.tryPromise({
    try: async () => {
      const artifactsRoot = getGeneratedArtifactsRoot(vault);
      const assetSource = path.join(artifactsRoot, "assets");
      await mkdir(vault.outDir, { recursive: true });
      await cp(assetSource, vault.outDir, { recursive: true, force: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        },
      );
    },
    catch: (cause) => cause as Error,
  });

const buildVault = (
  appRoot: string,
  vault: ResolvedConfig,
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const supportedVault = yield* ensureBuildTargetSupported(vault);
    const config = yield* createAppConfig(appRoot, supportedVault, "production", "build");
    yield* Effect.tryPromise({
      try: () => viteBuild(config).then(() => undefined),
      catch: (cause) => cause as Error,
    });
    if (supportedVault.target.type === "static") {
      yield* copyVaultAssets(supportedVault);
    }
  });

const devVault = (
  appRoot: string,
  vault: ResolvedConfig,
  options: DevOptions,
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const supportedVault = yield* ensureBuildTargetSupported(vault);
    const serverOptions: Partial<ServerOptions> = {};

    if (options.host) serverOptions.host = options.host;
    if (options.port) serverOptions.port = Number(options.port);

    const config = yield* createAppConfig(
      appRoot,
      supportedVault,
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

const previewVault = (
  appRoot: string,
  vault: ResolvedConfig,
  options: PreviewOptions,
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const supportedVault = yield* ensureBuildTargetSupported(vault);
    const config = yield* createAppConfig(
      appRoot,
      supportedVault,
      "production",
      "build",
    );
    // base is set via SVARTZ_BASE_PATH → svelte.config.js kit.paths.base; SvelteKit
    // overrides Vite's base, so merging base here would trigger the override warning.
    const previewConfig = mergeConfig(config, {
      build: { outDir: supportedVault.outDir },
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
    const vault = yield* selectVault(workspace.config, options.vault);
    yield* previewVault(workspace.appRoot, vault, options);
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
    const vault = yield* selectVault(workspace.config, options.vault);
    yield* devVault(workspace.appRoot, vault, options);
  });

const runDevSupervisor = async (options: DevOptions): Promise<void> => {
  let watchContext = await loadDevWatchContext(options);
  let watcher = createDevWatcher(watchContext, requestRestart);
  let child = startDevRunnerChild(options);
  let shuttingDown = false;
  let restarting = false;
  let pendingDescriptors: WatchDescriptor[] = [];

  function requestRestart(
    changedPath: string,
    descriptors: readonly WatchDescriptor[],
  ): void {
    const labels = descriptors.map((descriptor) => descriptor.label).join(", ");
    console.log(`[svartz:dev] restarting after ${changedPath} (${labels})`);
    pendingDescriptors.push(...descriptors);
    void flushRestartQueue();
  }

  async function flushRestartQueue(): Promise<void> {
    if (restarting || shuttingDown || pendingDescriptors.length === 0) return;
    restarting = true;

    try {
      const restartBatch = pendingDescriptors;
      pendingDescriptors = [];

      const buildFilters = restartBatch.flatMap(
        (descriptor) => descriptor.buildFilters ?? [],
      );
      if (buildFilters.length > 0) {
        await buildWorkspacePackages(watchContext.workspaceRoot, buildFilters);
      }

      await stopDevRunnerChild(child);
      await watcher.close();

      watchContext = await loadDevWatchContext(options);
      watcher = createDevWatcher(watchContext, requestRestart);
      child = startDevRunnerChild(options);
    } finally {
      restarting = false;
      if (pendingDescriptors.length > 0) {
        await flushRestartQueue();
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

    child.on("error", (cause) => {
      void cleanup();
      reject(cause);
    });

    child.on("exit", (code, signal) => {
      if (shuttingDown || restarting) {
        return;
      }

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
  });
};

const buildCommand = (options: BuildOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    if (options.vault) {
      const vault = yield* selectVault(workspace.config, options.vault);
      yield* buildVault(workspace.appRoot, vault);
      return;
    }

    yield* Effect.forEach(
      workspace.config.vaults,
      (vault) => buildVault(workspace.appRoot, vault),
      { concurrency: 1 },
    );
  });

const buildAllCommand = (options: SharedOptions): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    const workspace = yield* loadWorkspace(options.config);
    yield* Effect.forEach(
      workspace.config.vaults,
      (vault) => buildVault(workspace.appRoot, vault),
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
    .command("build")
    .description("Build all vaults, or one vault with --vault")
    .option("--config <path>", "Path to svartz.config.ts")
    .option("--vault <id>", "Vault ID to build")
    .action(async (options: BuildOptions) => {
      await runEffect(buildCommand(options));
    });

  program
    .command("build:all")
    .description("Build all configured vaults sequentially")
    .option("--config <path>", "Path to svartz.config.ts")
    .action(async (options: SharedOptions) => {
      await runEffect(buildAllCommand(options));
    });

  program
    .command("dev")
    .description("Run the dev server for one vault")
    .option("--config <path>", "Path to svartz.config.ts")
    .option("--vault <id>", "Vault ID to serve")
    .option("--host <host>", "Dev server host")
    .option("--port <port>", "Dev server port")
    .action(async (options: DevOptions) => {
      await runEffect(devCommand(options));
    });

  program
    .command("preview")
    .description("Serve the built output for one vault (run build first)")
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
