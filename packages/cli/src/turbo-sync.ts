import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfigSet } from "@svartz/config";

type PackageJson = {
  readonly [key: string]: unknown;
  readonly scripts?: Record<string, string>;
};

type TurboTask = {
  readonly [key: string]: unknown;
  readonly dependsOn?: readonly string[];
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly cache?: boolean;
  readonly persistent?: boolean;
};

type TurboJson = {
  readonly [key: string]: unknown;
  readonly tasks?: Record<string, TurboTask>;
};

const TURBO_JSON_SCHEMA = "https://turbo.build/schema.json";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function buildTaskName(vaultId: string): string {
  return `svartz:build:${vaultId}`;
}

function devTaskName(vaultId: string): string {
  return `svartz:dev:${vaultId}`;
}

function previewTaskName(vaultId: string): string {
  return `svartz:preview:${vaultId}`;
}

function turboTaskName(taskName: string): string {
  return `//#${taskName}`;
}

function isManagedScriptName(name: string): boolean {
  return (
    name === "svartz:build" ||
    name === "svartz:dev" ||
    name === "svartz:preview" ||
    /^svartz:(build|dev|preview):.+$/u.test(name)
  );
}

function isManagedTurboTaskName(name: string): boolean {
  return (
    name === turboTaskName("svartz:build") ||
    /^\/\/#svartz:(build|dev|preview):.+$/u.test(name)
  );
}

function createTurboRunScript(taskNames: readonly string[]): string {
  if (taskNames.length === 0) {
    return `node -e "process.stdout.write('No Svartz vault tasks configured.\\\\n')"`;
  }
  return `turbo run ${taskNames.join(" ")}`;
}

function getBuildTaskInputs(config: ResolvedConfigSet, vaultId: string, vaultPath: string): string[] {
  const relativeVaultPath = toPosixPath(path.relative(config.configDir, vaultPath));
  return [
    "apps/web/**",
    "package.json",
    "pnpm-lock.yaml",
    "svartz.config.*",
    ".svartzrc.*",
    `${relativeVaultPath}/**`,
  ];
}

function getBuildTaskOutputs(config: ResolvedConfigSet, outDir: string): string[] {
  return [`${toPosixPath(path.relative(config.configDir, outDir))}/**`];
}

function createManagedScripts(config: ResolvedConfigSet): Record<string, string> {
  const buildTasks = config.vaults.map((vault) => buildTaskName(vault.id));
  const devTasks = config.vaults.map((vault) => devTaskName(vault.id));
  const previewTasks = config.vaults.map((vault) => previewTaskName(vault.id));

  return {
    "svartz:build": "svartz run-managed-task svartz:build",
    ...Object.fromEntries(
      config.vaults.flatMap((vault) => [
        [buildTaskName(vault.id), `svartz build --vault ${vault.id}`],
        [devTaskName(vault.id), `svartz dev --vault ${vault.id}`],
        [previewTaskName(vault.id), `svartz preview --vault ${vault.id}`],
      ]),
    ),
    "svartz:dev": createTurboRunScript(devTasks),
    "svartz:preview": createTurboRunScript(previewTasks),
  };
}

function createManagedTurboTasks(config: ResolvedConfigSet): Record<string, TurboTask> {
  return {
    [turboTaskName("svartz:build")]: {
      dependsOn: config.vaults.map((vault) => turboTaskName(buildTaskName(vault.id))),
    },
    ...Object.fromEntries(
      config.vaults.flatMap((vault) => [
        [
          turboTaskName(buildTaskName(vault.id)),
          {
            inputs: getBuildTaskInputs(config, vault.id, vault.path),
            outputs: getBuildTaskOutputs(config, vault.outDir),
          } satisfies TurboTask,
        ],
        [
          turboTaskName(devTaskName(vault.id)),
          {
            cache: false,
            persistent: true,
          } satisfies TurboTask,
        ],
        [
          turboTaskName(previewTaskName(vault.id)),
          {
            dependsOn: [turboTaskName(buildTaskName(vault.id))],
            cache: false,
            persistent: true,
          } satisfies TurboTask,
        ],
      ]),
    ),
  };
}

function mergeManagedScripts(
  existingScripts: Record<string, string> | undefined,
  managedScripts: Record<string, string>,
): Record<string, string> {
  const nextScripts: Record<string, string> = {};

  for (const [name, value] of Object.entries(existingScripts ?? {})) {
    if (isManagedScriptName(name)) continue;
    nextScripts[name] = value;
  }

  for (const [name, value] of Object.entries(managedScripts)) {
    nextScripts[name] = value;
  }

  return nextScripts;
}

function mergeManagedTurboTasks(
  existingTasks: Record<string, TurboTask> | undefined,
  managedTasks: Record<string, TurboTask>,
): Record<string, TurboTask> {
  const nextTasks: Record<string, TurboTask> = {};

  for (const [name, value] of Object.entries(existingTasks ?? {})) {
    if (isManagedTurboTaskName(name)) continue;
    nextTasks[name] = value;
  }

  for (const [name, value] of Object.entries(managedTasks)) {
    nextTasks[name] = value;
  }

  return nextTasks;
}

function createNextPackageJson(
  existingPackageJson: PackageJson,
  config: ResolvedConfigSet,
): PackageJson {
  return {
    ...existingPackageJson,
    scripts: mergeManagedScripts(existingPackageJson.scripts, createManagedScripts(config)),
  };
}

function createNextTurboJson(
  existingTurboJson: TurboJson,
  config: ResolvedConfigSet,
): TurboJson {
  return {
    $schema:
      typeof existingTurboJson.$schema === "string"
        ? existingTurboJson.$schema
        : TURBO_JSON_SCHEMA,
    ...existingTurboJson,
    tasks: mergeManagedTurboTasks(existingTurboJson.tasks, createManagedTurboTasks(config)),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeJsonIfChanged(filePath: string, value: unknown): Promise<void> {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  let current = "";

  try {
    current = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (current === next) return;
  await writeFile(filePath, next);
}

async function syncManagedTurboFiles(config: ResolvedConfigSet): Promise<void> {
  const packageJsonPath = path.join(config.configDir, "package.json");
  const turboJsonPath = path.join(config.configDir, "turbo.json");

  const existingPackageJson = (await readJsonFile<PackageJson>(packageJsonPath)) ?? {};
  const existingTurboJson = (await readJsonFile<TurboJson>(turboJsonPath)) ?? {
    $schema: TURBO_JSON_SCHEMA,
    tasks: {},
  };

  await writeJsonIfChanged(packageJsonPath, createNextPackageJson(existingPackageJson, config));
  await writeJsonIfChanged(turboJsonPath, createNextTurboJson(existingTurboJson, config));
}

export {
  createManagedScripts,
  createManagedTurboTasks,
  createNextPackageJson,
  createNextTurboJson,
  syncManagedTurboFiles,
};
