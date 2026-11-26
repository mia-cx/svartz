import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSvelteKit3 } from "@svartz/vite";
import { Data, Effect, Either } from "effect";
import {
  InitCancelledError,
  InitUsageError,
  renderConfig,
  themePackages,
  vaultsFromFlags,
  type InitContext,
  type VaultChoice,
} from "./init-plan";
import { resolveAppLocation } from "./workspace";

const templateRoot = fileURLToPath(new URL("../template/", import.meta.url));
const configName = "svartz.config.ts";
const configNames = [
  "svartz.config.ts",
  "svartz.config.mjs",
  "svartz.config.js",
  ".svartzrc.ts",
  ".svartzrc.mjs",
  ".svartzrc.js",
] as const;
const svartzDependencies = [
  "svartz",
  "@svartz/config",
  "@svartz/theme-minimal",
  "@svartz/ui",
  "@svartz/vite",
] as const;

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
type Manifest = {
  name?: string;
  private?: boolean;
  type?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};

/** The Node versions a new project's SvelteKit 3 toolchain runs on: SvelteKit 3 needs 22.17, vite-plugin-svelte 7 skips 23. */
const SCAFFOLD_NODE = "^22.17.0 || >=24.0.0";

/** Whether Node `version` (`process.versions.node`) satisfies {@link SCAFFOLD_NODE}. */
function runsScaffold(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major >= 24 || (major === 22 && minor >= 17);
}

export type InitOptions = {
  readonly cwd?: string;
  readonly install?: boolean;
  readonly git?: boolean;
  /** The running Node version; a new project needs {@link SCAFFOLD_NODE}. */
  readonly nodeVersion?: string;
  /**
   * The vaults to write, asked once the project passes its checks and only when it has no config. Defaults to one
   * `vault` folder on theme-minimal, deploying as static files (or through the host app).
   */
  readonly vaults?: (context: InitContext) => readonly VaultChoice[] | Promise<readonly VaultChoice[]>;
};

export type InitResult = {
  readonly kind: "created" | "integrated" | "already-configured";
  readonly packageManager: PackageManager;
  /** The vaults written to the new config; none when the project already had one. */
  readonly vaults: readonly VaultChoice[];
};

/** Existing consumer-owned files prevent a safe scaffold write. */
export class InitConflictError extends Data.TaggedError("InitConflictError")<{
  readonly paths: readonly string[];
  readonly message: string;
}> {}

/** The existing project cannot be integrated without a manual layout change. */
export class InitLayoutError extends Data.TaggedError("InitLayoutError")<{
  readonly reason: "unsupported-vite" | "unsupported-tailwind" | "unsupported-node";
  readonly message: string;
}> {}

/** A filesystem or input operation failed while preparing the scaffold. */
export class InitOperationError extends Data.TaggedError("InitOperationError")<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Git initialization or dependency installation failed. */
export class InitCommandError extends Data.TaggedError("InitCommandError")<{
  readonly command: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export type InitError =
  | InitConflictError
  | InitLayoutError
  | InitOperationError
  | InitCommandError
  | InitUsageError
  | InitCancelledError;

export { InitCancelledError, InitUsageError };

const operation = <A>(
  name: string,
  work: () => Promise<A>,
): Effect.Effect<A, InitOperationError> =>
  Effect.tryPromise({
    try: work,
    catch: (cause) =>
      new InitOperationError({
        operation: name,
        cause,
        message: `${name}: ${String(cause)}`,
      }),
  });

const inspect = <A>(
  name: string,
  work: () => A,
): Effect.Effect<A, InitOperationError> =>
  Effect.try({
    try: work,
    catch: (cause) =>
      new InitOperationError({
        operation: name,
        cause,
        message: `${name}: ${String(cause)}`,
      }),
  });

const command = (
  name: string,
  args: string[],
  root: string,
): Effect.Effect<void, InitCommandError> =>
  Effect.tryPromise({
    try: () => run(name, args, root),
    catch: (cause) =>
      new InitCommandError({
        command: `${name} ${args.join(" ")}`,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

/** A new project's files besides its vaults. It builds with the app Svartz ships, so it needs no app of its own. */
const NEW_PROJECT_FILES = [".gitignore", configName, "package.json"] as const;
/** One file integration writes into a host app: its absolute path, the operation's name for errors, and the write. */
type PlannedWrite = { readonly file: string; readonly name: string; readonly write: () => Promise<void> };

/** The note a new vault starts with. */
const STARTER_NOTE = "index.md";

const chooseVaults = (
  options: InitOptions,
  context: InitContext,
): Effect.Effect<readonly VaultChoice[], InitUsageError | InitCancelledError | InitOperationError> =>
  Effect.tryPromise({
    try: async () => options.vaults ? options.vaults(context) : vaultsFromFlags({}, context),
    catch: (cause) =>
      cause instanceof InitUsageError || cause instanceof InitCancelledError
        ? cause
        : new InitOperationError({ operation: "choose vaults", cause, message: `choose vaults: ${String(cause)}` }),
  });

/** The vaults that get a starter note: those whose folder doesn't exist yet. A folder that exists is published as it is. */
const newVaults = (root: string, vaults: readonly VaultChoice[]) =>
  vaults.filter((vault) => !existsSync(path.join(root, vault.path)));

/** Whether project-relative `child` lies inside `parent`. */
const within = (child: string, parent: string) =>
  parent === "." ? child !== "." && !child.startsWith("../") : child.startsWith(`${parent}/`);

/**
 * Why `vaults` can't be written beside `files`, the project files init writes, or nothing when they can: a vault
 * path that is a file, or would be one of init's files; a new vault inside another vault, whose folder init would then
 * write into, or holding one of init's files; and files standing where a new vault's folders would go.
 */
async function vaultConflicts(
  root: string,
  vaults: readonly VaultChoice[],
  files: readonly string[],
): Promise<InitConflictError | undefined> {
  const problems: [path: string, problem: string][] = [];
  for (const vault of vaults) {
    const info = await stat(path.join(root, vault.path)).catch(() => undefined);
    if (info && !info.isDirectory()) problems.push([vault.path, `${vault.path} exists and isn't a folder`]);
    const file = files.find((name) => vault.path === name || within(vault.path, name));
    if (file)
      problems.push([vault.path, file === vault.path
        ? `${file} is a file init writes, so it can't be a vault`
        : `the vault ${vault.path} would sit inside ${file}, a file init writes`]);
  }
  const fresh = newVaults(root, vaults);
  for (const vault of fresh) {
    const outer = vaults.find((other) => within(vault.path, other.path));
    if (outer) problems.push([vault.path, `the new vault ${vault.path} would sit inside the vault ${outer.path}`]);
    const inner = files.find((name) => within(name, vault.path));
    if (inner) problems.push([vault.path, `the new vault ${vault.path} would hold ${inner}, which init writes`]);
  }
  const notes = fresh.map((vault) => path.join(vault.path, STARTER_NOTE));
  for (const blocked of await nonDirectoryAncestors(root, notes))
    problems.push([blocked, `${blocked} exists and isn't a folder`]);
  if (problems.length === 0) return undefined;
  return new InitConflictError({
    paths: [...new Set(problems.map(([where]) => where))],
    message: `Cannot initialize: ${[...new Set(problems.map(([, problem]) => problem))].join("; ")}. No files changed.`,
  });
}

/** Each new vault's folder, with the starter note in it. */
const writeStarterNotes = (root: string, vaults: readonly VaultChoice[]) =>
  Effect.gen(function* () {
    const fresh = newVaults(root, vaults);
    if (fresh.length === 0) return;
    const note = yield* operation("read starter note template", () =>
      readFile(path.join(templateRoot, "vault", STARTER_NOTE), "utf8"),
    );
    for (const vault of fresh)
      yield* operation(`write ${vault.path}/${STARTER_NOTE}`, () =>
        writeNewFile(path.join(root, vault.path, STARTER_NOTE), note),
      );
  });

const PAGE_ROUTE_FILES = ["+page.svelte", "+page.ts", "+page.server.ts"] as const;

/** The catchall's lines for the latest version's own id, which catchalls generated before versioned docs lack. */
const TEMPORARY_REDIRECTS = [
  "  // A version's own id leads to the latest version only until a newer one ships, so that redirect is temporary.\n",
  "  const latest = routes.temporaryRedirects[pathname];\n",
  "  if (latest) redirect(307, `${base}${latest}`);\n",
].join("");
/** Files only SvelteKit 2 hosts get. */
const kit2TemplateRoot = path.join(templateRoot, "sveltekit-2");

/**
 * The param matcher files the plugin page route needs that the host lacks, as `[destination, template]` pairs:
 * SvelteKit 3 reads one `params` export from `src/params`, SvelteKit 2 one `match` file per matcher in `src/params/`.
 * `undefined` when a SvelteKit 3 host's own `src/params` defines neither matcher, since init can't merge into it.
 */
async function missingParamMatchers(root: string): Promise<[string, string][] | undefined> {
  if (!isSvelteKit3(root)) {
    return ["svartzMount", "svartzPage"]
      .map((name) => path.join("src", "params", `${name}.ts`))
      .filter((file) => !existsSync(path.join(root, file)))
      .map((file) => [file, path.join(kit2TemplateRoot, file)]);
  }
  const entry = ["params.ts", "params.js", "params/index.ts", "params/index.js"]
    .map((file) => path.join(root, "src", file))
    .find(existsSync);
  if (!entry) return [[path.join("src", "params.ts"), path.join(templateRoot, "src", "params.ts")]];
  const source = await readFile(entry, "utf8");
  return source.includes("svartzMount") && source.includes("svartzPage") ? [] : undefined;
}

/** Select the package manager declared by an existing project or its lockfile. */
export function packageManager(root: string, manifest?: Manifest): PackageManager {
  const declared = manifest?.packageManager?.split("@")[0];
  if (
    declared === "npm" ||
    declared === "pnpm" ||
    declared === "yarn" ||
    declared === "bun"
  )
    return declared;
  if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (
    existsSync(path.join(root, "bun.lock")) ||
    existsSync(path.join(root, "bun.lockb"))
  )
    return "bun";
  return "npm";
}

function packageName(root: string): string {
  return (
    path
      .basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "svartz-site"
  );
}

function insideGitWorktree(root: string): boolean {
  return (
    spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      stdio: "ignore",
    }).status === 0
  );
}

/** `themes` are the theme packages the vaults use beyond theme-minimal, which Svartz ships. */
function freshManifest(root: string, themes: readonly string[]): Manifest {
  return {
    name: packageName(root),
    private: true,
    type: "module",
    scripts: {
      dev: "svartz dev",
      build: "svartz build",
      preview: "svartz preview",
    },
    engines: { node: SCAFFOLD_NODE },
    devDependencies: {
      "@svartz/config": "latest",
      svartz: "latest",
      ...Object.fromEntries(themes.map((theme) => [theme, "latest"])),
      tailwindcss: "^4.1.18",
      vite: "^8.3.8",
    },
  };
}

function integrateManifest(manifest: Manifest, themes: readonly string[]): Manifest {
  const scripts = { ...manifest.scripts };
  scripts["svartz:dev"] ??= "svartz dev";
  scripts["svartz:build"] ??= "svartz build";
  scripts["svartz:preview"] ??= "svartz preview";
  const devDependencies = { ...manifest.devDependencies };
  for (const name of [...svartzDependencies, ...themes]) {
    if (!manifest.dependencies?.[name] && !devDependencies[name])
      devDependencies[name] = "latest";
  }
  if (!manifest.dependencies?.tailwindcss && !devDependencies.tailwindcss)
    devDependencies.tailwindcss = "^4.2.2";
  return { ...manifest, scripts, devDependencies };
}

function integrateViteConfig(source: string, configPath: string): string | undefined {
  if (/\.(?:cjs|cts)$/.test(configPath) && /\bmodule\.exports\s*=/.test(source)) {
    if (source.includes("const __svartz_host_config = module.exports;")) return source;
    return `${source.trimEnd()}
const __svartz_host_config = module.exports;
module.exports = async (env) => {
  const { withSvartzHost } = await import('@svartz/vite/host');
  return withSvartzHost(__svartz_host_config)(env);
};
`;
  }
  const activeSource = source.replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/[^\r\n]*/gm,
    (comment) => comment.replace(/[^\r\n]/g, " "));
  const hostImport = [...activeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@svartz\/vite\/host['"]/g)]
    .flatMap((match) => match[1]!.split(","))
    .map((specifier) => /^withSvartzHost(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(specifier.trim()))
    .find((match) => match !== null);
  let binding = hostImport?.[1] ?? (hostImport ? "withSvartzHost" : "__svartz_with_host");
  const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!hostImport) {
    let suffix = 2;
    while (new RegExp(`\\b${binding}\\b`).test(source)) binding = `__svartz_with_host_${suffix++}`;
  }
  const defaultExport = /(?:^|[;}\n])([ \t]*)export\s+default\s+/g;
  const match = defaultExport.exec(activeSource);
  if (!match) return undefined;
  const exportIndex = match.index + match[0].lastIndexOf("export");
  const expressionIndex = match.index + match[0].length;
  if (hostImport && new RegExp(`^\\(*\\s*${escapedBinding}\\s*\\)*\\s*\\(`)
    .test(activeSource.slice(expressionIndex))) return source;
  const hostImportLine = hostImport ? "" : `import { withSvartzHost as ${binding} } from '@svartz/vite/host';\n`;
  const wrapped = source.slice(0, exportIndex) + `const __svartz_host_config = ` +
    source.slice(expressionIndex);
  return `${hostImportLine}${wrapped}\nexport default ${binding}(__svartz_host_config);\n`;
}

async function hasHostCatchall(root: string): Promise<boolean> {
  const routesRoot = path.join(root, "src", "routes");
  const search = async (directory: string): Promise<boolean> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const next = path.join(directory, entry.name);
      if (/^\[\.\.\.[^\]]+\]$/.test(entry.name)) {
        const files = await readdir(next);
        if (files.some((name) => /^\+(?:page|server)(?:@[^.]*)?(?:\.[^.]+)?\.(?:svelte|js|ts)$/.test(name))) return true;
      }
      if (entry.name.startsWith("(") && entry.name.endsWith(")") && await search(next)) return true;
    }
    return false;
  };
  if (!existsSync(routesRoot)) return false;
  return search(routesRoot);
}

async function nonDirectoryAncestors(root: string, destinations: readonly string[]): Promise<string[]> {
  const blocked = new Set<string>();
  for (const destination of destinations) {
    for (let parent = path.dirname(destination); parent !== "."; parent = path.dirname(parent)) {
      try {
        if (!(await lstat(path.join(root, parent))).isDirectory()) blocked.add(parent);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
      }
    }
  }
  return [...blocked].sort();
}

export function commandExecutable(command: string, platform = process.platform): string {
  return platform === "win32" && ["npm", "pnpm", "yarn"].includes(command)
    ? `${command}.cmd`
    : command;
}

async function writeNewFile(
  destination: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const file = await open(destination, "wx");
  try {
    await file.writeFile(content);
  } finally {
    await file.close();
  }
}

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  const child = spawn(
    commandExecutable(command),
    args,
    {
      cwd,
      stdio: "inherit",
    },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${code}`,
    );
}

const initProjectEffect = (
  options: InitOptions = {},
): Effect.Effect<InitResult, InitError> =>
  Effect.gen(function* () {
    const root = path.resolve(options.cwd ?? process.cwd());
    const location = yield* inspect("inspect SvelteKit app", () =>
      resolveAppLocation(root),
    );
    const existingConfig = configNames
      .map((name) => path.join(root, name))
      .find(existsSync);
    const existingManifestPath = path.join(root, "package.json");
    const manifestSource = existsSync(existingManifestPath)
      ? yield* operation("read package.json", () =>
          readFile(existingManifestPath, "utf8"),
        )
      : undefined;
    const existingManifest =
      manifestSource === undefined
        ? undefined
        : yield* inspect(
            "parse package.json",
            () => JSON.parse(manifestSource) as Manifest,
          );
    const manager = yield* inspect("detect package manager", () =>
      packageManager(root, existingManifest),
    );

    if (location.hostApp) {
      const tailwindVersion = existingManifest?.dependencies?.tailwindcss
        ?? existingManifest?.devDependencies?.tailwindcss;
      if (tailwindVersion && (/(?:^|[\s|@#])(?:[~^<>=]*\s*)v?3(?=\.|x|\*|\b)/.test(tailwindVersion) ||
        /^workspace:\s*(?:[~^<>=]*\s*)v?3(?=\.|x|\*|\b)/.test(tailwindVersion))) {
        return yield* new InitLayoutError({
          reason: "unsupported-tailwind",
          message: "Cannot integrate: this host uses Tailwind CSS 3. Upgrade to Tailwind CSS 4 before running svartz init.",
        });
      }
      const rootLayoutPath = path.join(root, "src", "routes", "+layout.svelte");
      const rootLayoutTemplate = yield* operation(
        "read root layout template",
        () =>
          readFile(
            path.join(templateRoot, "src", "routes", "+layout.svelte"),
            "utf8",
          ),
      );
      const previousRootLayout = rootLayoutTemplate.replace(
        "  let { children }",
        "  import './layout.css';\n  let { children }",
      );
      const migrateRootLayout =
        existsSync(rootLayoutPath) &&
        !existsSync(path.join(root, "src", "routes", "layout.css")) &&
        (yield* operation("read host root layout", () =>
          readFile(rootLayoutPath, "utf8"),
        )) === previousRootLayout;
      const appTypesPath = path.join(root, "src", "app.d.ts");
      const appTypesReference =
        '/// <reference types="@svartz/vite/virtual-modules" />';
      const appTypesSource = existsSync(appTypesPath)
        ? yield* operation("read host app types", () =>
            readFile(appTypesPath, "utf8"),
          )
        : undefined;
      const virtualModuleReference = /^[ \t]*\/\/\/\s*<reference\s+types\s*=\s*(['"])@svartz\/(?:vite|ui)\/virtual-modules\1\s*\/>[ \t]*(?:\r?\n|$)/gm;
      const integratedAppTypes = `${appTypesReference}\n${appTypesSource?.replace(virtualModuleReference, "") ?? ""}`;
      const catchallRoot = path.join(root, "src", "routes", "[...slug]");
      const catchallRootInfo = yield* operation("inspect host catchall path", async () =>
        lstat(catchallRoot).catch((cause: NodeJS.ErrnoException) => {
          if (cause.code === "ENOENT") return undefined;
          throw cause;
        }),
      );
      if (catchallRootInfo?.isSymbolicLink()) {
        return yield* new InitConflictError({
          paths: ["src/routes/[...slug]"],
          message: "Cannot integrate: the host catchall directory is a symlink. Resolve it before running svartz init.",
        });
      }
      const catchallPagePath = path.join(catchallRoot, "+page.svelte");
      const catchallLoadPath = path.join(catchallRoot, "+page.ts");
      const catchallServerPath = path.join(catchallRoot, "+page.server.ts");
      const installCatchall = !(yield* operation("inspect host catchall", () =>
        hasHostCatchall(root),
      ));
      const catchallPageTemplate = yield* operation(
        "read catchall page template",
        () =>
          readFile(
            path.join(
              templateRoot,
              "src",
              "routes",
              "[...slug]",
              "+page.svelte",
            ),
            "utf8",
          ),
      );
      const previousStyledCatchallPage = catchallPageTemplate
        .replace("  import type { PageData } from './$types';\n", "")
        .replace("  let { data }: { data: PageData } = $props();\n", "")
        .replace('\n<svelte:head>\n  {#each data.svartzStylesheets as stylesheet}\n    <link rel="stylesheet" href={stylesheet} />\n  {/each}\n</svelte:head>\n', "");
      const previousCatchallPage = previousStyledCatchallPage.replace(
        "  import 'virtual:svartz/tailwind-sources.css';\n",
        "",
      );
      const existingCatchallPage = existsSync(catchallPagePath)
        ? yield* operation("read host catchall page", () =>
          readFile(catchallPagePath, "utf8"),
        ) : undefined;
      const catchallLoadTemplate = yield* operation(
        "read catchall load template",
        () =>
          readFile(
            path.join(templateRoot, "src", "routes", "[...slug]", "+page.ts"),
            "utf8",
          ),
      );
      const catchallServerTemplate = yield* operation("read catchall server load template", () =>
        readFile(path.join(templateRoot, "src", "routes", "[...slug]", "+page.server.ts"), "utf8"),
      );
      const existingCatchallServer = existsSync(catchallServerPath)
        ? yield* operation("read host catchall server load", () => readFile(catchallServerPath, "utf8"))
        : undefined;
      // Templates before versioned docs had no temporary redirects for the latest version's own id.
      const previousRedirectsLoad = catchallLoadTemplate.replace(TEMPORARY_REDIRECTS, "");
      // Templates before SvelteKit 3 support read `base` and `assets` from `$app/paths`, which SvelteKit 3 dropped.
      const previousAppPathsLoad = previousRedirectsLoad.replace(
        "import { decodeRoutePath } from '@svartz/ui/runtime';\nimport { base, prepareHostVault, routes }",
        "import { base } from '$app/paths';\nimport { decodeRoutePath } from '@svartz/ui/runtime';\nimport { prepareHostVault, routes }",
      );
      const previousAppPathsServer = `import { assets, base } from '$app/paths';\n${catchallServerTemplate
        .replace("import { assets, base, hostStylesheets, prepareHostVault }", "import { hostStylesheets, prepareHostVault }")}`;
      const previousUniversalStylesLoad = previousAppPathsLoad
        .replace("import { base }", "import { assets, base }")
        .replace("import { prepareHostVault, routes }", "import { hostStylesheets, prepareHostVault, routes }")
        .replace("async ({ url, data })", "async ({ url })")
        .replace("  return data;\n", "  return { svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`) };\n");
      // Older templates raised the 404 before preparing the theme the error page renders.
      const prepareThen404 = "  await prepareHostVault(pathname);\n  if (!routes.all.includes(pathname)) error(404);\n";
      const previousOrderedCatchallLoad = previousUniversalStylesLoad.replace(
        prepareThen404,
        "  if (!routes.all.includes(pathname)) error(404);\n  await prepareHostVault(pathname);\n",
      );
      const previousStyledCatchallLoad = previousOrderedCatchallLoad
        .replace("import { assets, base }", "import { base }")
        .replace("import { hostStylesheets, prepareHostVault, routes }", "import { prepareHostVault, routes }")
        .replace("  return { svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`) };\n", "");
      const previousCatchallLoad = previousStyledCatchallLoad
        .replace("import { prepareHostVault, routes }", "import { routes }")
        .replace("export const load = async", "export const load =")
        .replace("  await prepareHostVault(pathname);\n", "");
      const existingCatchallLoad = existsSync(catchallLoadPath)
        ? yield* operation("read host catchall", () =>
          readFile(catchallLoadPath, "utf8"),
        ) : undefined;
      // Recognize generated loaders from before path decoding without claiming host-owned loaders.
      const withoutPathDecoding = (source: string) => source
        .replace("import { decodeRoutePath } from '@svartz/ui/runtime';\n", "")
        .replace("import { error } from '@sveltejs/kit';\n", "")
        .replace("decodeRoutePath(base ? url.pathname.slice(base.length) || '/' : url.pathname);\n  if (appPath === undefined) error(404);",
          "base ? url.pathname.slice(base.length) || '/' : url.pathname;");
      const generatedLoads = [catchallLoadTemplate, previousRedirectsLoad, previousAppPathsLoad, previousUniversalStylesLoad, previousOrderedCatchallLoad, previousStyledCatchallLoad, previousCatchallLoad];
      const generatedServers = [catchallServerTemplate, previousAppPathsServer];
      const compatibleCatchallLoad = existingCatchallLoad !== undefined &&
        [...generatedLoads, ...generatedLoads.map(withoutPathDecoding)].includes(existingCatchallLoad) &&
        !existsSync(path.join(catchallRoot, "+page.server.js")) &&
        (existingCatchallServer === undefined || [...generatedServers, ...generatedServers.map(withoutPathDecoding)].includes(existingCatchallServer));
      const migrateCatchall = compatibleCatchallLoad && existingCatchallLoad !== catchallLoadTemplate;
      const installCatchallServer = compatibleCatchallLoad && existingCatchallServer !== catchallServerTemplate;
      const catchallPageUpdate =
        compatibleCatchallLoad && [previousStyledCatchallPage, previousCatchallPage].includes(existingCatchallPage ?? "")
          ? catchallPageTemplate
          : existingCatchallPage === previousCatchallPage ? previousStyledCatchallPage : undefined;
      const migrateCatchallPage = catchallPageUpdate !== undefined && catchallPageUpdate !== existingCatchallPage;
      const viteSource = yield* operation("read host Vite config", () =>
        readFile(location.viteConfigPath, "utf8"),
      );
      const svelteConfigPath = ["js", "ts"].map((extension) => path.join(root, `svelte.config.${extension}`)).find(existsSync);
      const svelteConfigSource = svelteConfigPath
        ? yield* operation("read host Svelte config", () => readFile(svelteConfigPath, "utf8"))
        : "";
      // Plugin pages under /-/ render through their own route, whose param matchers leave every path no plugin claims,
      // such as a note in a folder named `-`, to the catchall. A host that has the route keeps it as it is. A static
      // host can't serve plugin pages, and adapter-static without a fallback refuses a route that isn't prerendered.
      const pageRoute = path.join("src", "routes", "[...mount=svartzMount]", "-", "[...page=svartzPage]");
      const pageRouteTemplates = yield* operation("read plugin page route templates", () =>
        Promise.all(PAGE_ROUTE_FILES.map((name) => readFile(path.join(templateRoot, pageRoute, name), "utf8"))),
      );
      const params = yield* operation("inspect host param matchers", () => missingParamMatchers(root));
      const installPageRoute = !existsSync(path.join(root, pageRoute))
        && !`${viteSource}\n${svelteConfigSource}`.includes("@sveltejs/adapter-static")
        && params !== undefined;
      const integratedViteSource = integrateViteConfig(
        viteSource,
        location.viteConfigPath,
      );
      if (integratedViteSource === undefined)
        return yield* new InitLayoutError({
          reason: "unsupported-vite",
          message:
            "Cannot integrate: Vite config has no default export. Add withSvartzHost from @svartz/vite/host manually.",
        });
      const vaults = existingConfig ? [] : yield* chooseVaults(options, {
        root,
        host: true,
        siteName: existingManifest?.name ?? packageName(root),
      });
      const integratedManifest = integrateManifest(existingManifest ?? {}, themePackages(vaults));
      const manifestChanged =
        JSON.stringify(existingManifest) !== JSON.stringify(integratedManifest);
      const writeTemplate = (file: string, template: string) => async () =>
        writeNewFile(file, await readFile(template, "utf8"));
      // Everything integration writes in this host, in order. The already-configured check, the vault preflight and
      // the writes all read this one list, so what preflight claims can't drift from what init writes.
      const hostWrites: readonly PlannedWrite[] = [
        ...(integratedViteSource !== viteSource
          ? [{ file: location.viteConfigPath, name: "write host Vite config",
            write: () => writeFile(location.viteConfigPath, integratedViteSource) }]
          : []),
        ...(integratedAppTypes !== appTypesSource
          ? [appTypesSource === undefined
            ? { file: appTypesPath, name: "write host app types", write: () => writeNewFile(appTypesPath, integratedAppTypes) }
            : { file: appTypesPath, name: "update host app types", write: () => writeFile(appTypesPath, integratedAppTypes) }]
          : []),
        ...(installCatchall
          ? PAGE_ROUTE_FILES.map((name) => ({
            file: path.join(catchallRoot, name),
            name: `write ${name}`,
            write: writeTemplate(path.join(catchallRoot, name), path.join(templateRoot, "src", "routes", "[...slug]", name)),
          }))
          : []),
        ...(installPageRoute
          ? [
            ...PAGE_ROUTE_FILES.map((name, index) => ({
              file: path.join(root, pageRoute, name),
              name: `write plugin page ${name}`,
              write: () => writeNewFile(path.join(root, pageRoute, name), pageRouteTemplates[index]!),
            })),
            ...(params ?? []).map(([destination, template]) => ({
              file: path.join(root, destination),
              name: `write ${destination}`,
              write: writeTemplate(path.join(root, destination), template),
            })),
          ]
          : []),
        ...(installCatchallServer
          ? [{ file: catchallServerPath, name: "write catchall server load",
            write: () => existingCatchallServer === undefined
              ? writeNewFile(catchallServerPath, catchallServerTemplate)
              : writeFile(catchallServerPath, catchallServerTemplate) }]
          : []),
        ...(migrateCatchall
          ? [{ file: catchallLoadPath, name: "update host catchall load", write: () => writeFile(catchallLoadPath, catchallLoadTemplate) }]
          : []),
        ...(migrateCatchallPage && catchallPageUpdate !== undefined
          ? [{ file: catchallPagePath, name: "update host catchall page", write: () => writeFile(catchallPagePath, catchallPageUpdate) }]
          : []),
        ...(migrateRootLayout
          ? [{ file: rootLayoutPath, name: "update host root layout", write: () => writeFile(rootLayoutPath, rootLayoutTemplate) }]
          : []),
        ...(manifestChanged
          ? [{ file: existingManifestPath, name: "write package.json",
            write: () => writeFile(existingManifestPath, `${JSON.stringify(integratedManifest, null, 2)}\n`) }]
          : []),
      ];
      if (existingConfig && hostWrites.length === 0) {
        return { kind: "already-configured", packageManager: manager, vaults };
      }
      if (!existingConfig) {
        const files = [path.join(root, configName), ...hostWrites.map(({ file }) => file)]
          .map((file) => path.relative(root, file).split(path.sep).join("/"));
        const conflict = yield* operation("inspect vault paths", () => vaultConflicts(root, vaults, files));
        if (conflict) return yield* conflict;
        yield* operation("write Svartz config", () =>
          writeNewFile(path.join(root, configName), renderConfig(vaults)),
        );
        yield* writeStarterNotes(root, vaults);
      }
      for (const { name, write } of hostWrites) yield* operation(name, write);
      if (options.install !== false) yield* command(manager, ["install"], root);
      return { kind: "integrated", packageManager: manager, vaults };
    }

    // Without a SvelteKit app, a config is all a project needs: Svartz builds it with the app it ships.
    if (existingConfig) return { kind: "already-configured", packageManager: manager, vaults: [] };

    const nodeVersion = options.nodeVersion ?? process.versions.node;
    if (!runsScaffold(nodeVersion))
      return yield* new InitLayoutError({
        reason: "unsupported-node",
        message: `Cannot initialize: a new Svartz project runs SvelteKit 3, which needs Node ${SCAFFOLD_NODE}; this is Node ${nodeVersion}. No files changed.`,
      });

    // Checked before any question, so nobody answers them for a project init can't write.
    const conflicts = NEW_PROJECT_FILES.filter((name) => existsSync(path.join(root, name)));
    if (conflicts.length)
      return yield* new InitConflictError({
        paths: conflicts,
        message: `Cannot initialize: these files already exist: ${conflicts.join(", ")}`,
      });
    const vaults = yield* chooseVaults(options, { root, host: false, siteName: packageName(root) });
    const conflict = yield* operation("inspect vault paths", () => vaultConflicts(root, vaults, NEW_PROJECT_FILES));
    if (conflict) return yield* conflict;
    const gitignore = yield* operation("read gitignore template", () =>
      readFile(path.join(templateRoot, "gitignore"), "utf8"),
    );
    yield* operation("write .gitignore", () => writeNewFile(path.join(root, ".gitignore"), gitignore));
    yield* operation("write Svartz config", () => writeNewFile(path.join(root, configName), renderConfig(vaults)));
    yield* writeStarterNotes(root, vaults);
    yield* operation("write package.json", () =>
      writeNewFile(
        existingManifestPath,
        `${JSON.stringify(freshManifest(root, themePackages(vaults)), null, 2)}\n`,
      ),
    );
    if (options.git !== false && !insideGitWorktree(root))
      yield* command("git", ["init"], root);
    if (options.install !== false) yield* command(manager, ["install"], root);
    return { kind: "created", packageManager: manager, vaults };
  });

/** Initialize the invocation directory without replacing consumer-owned files. */
export function initProject(options: InitOptions = {}): Promise<InitResult> {
  return Effect.runPromise(initProjectEffect(options).pipe(Effect.either)).then(
    (result) => {
      if (Either.isRight(result)) return result.right;
      throw result.left;
    },
  );
}
