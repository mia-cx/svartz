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
import { Data, Effect, Either } from "effect";
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
};

export type InitOptions = {
  readonly cwd?: string;
  readonly install?: boolean;
  readonly git?: boolean;
};

export type InitResult = {
  readonly kind: "created" | "integrated" | "already-configured";
  readonly packageManager: PackageManager;
};

/** Existing consumer-owned files prevent a safe scaffold write. */
export class InitConflictError extends Data.TaggedError("InitConflictError")<{
  readonly paths: readonly string[];
  readonly message: string;
}> {}

/** The existing project cannot be integrated without a manual layout change. */
export class InitLayoutError extends Data.TaggedError("InitLayoutError")<{
  readonly reason: "missing-kit" | "unsupported-vite" | "unsupported-tailwind";
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
  | InitCommandError;

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

async function templateFiles(
  directory = templateRoot,
  relative = "",
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const name = path.join(relative, entry.name);
      return entry.isDirectory()
        ? templateFiles(path.join(directory, entry.name), name)
        : [name];
    }),
  );
  return files.flat().sort();
}

function packageManager(root: string, manifest?: Manifest): PackageManager {
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

function freshManifest(root: string): Manifest {
  return {
    name: packageName(root),
    private: true,
    type: "module",
    scripts: {
      dev: "svartz dev --vault notes",
      build: "svartz build --vault notes",
      preview: "svartz preview --vault notes",
      prepare: "svelte-kit sync",
    },
    devDependencies: {
      "@svartz/config": "latest",
      "@svartz/theme-minimal": "latest",
      "@svartz/ui": "latest",
      "@svartz/vite": "latest",
      svartz: "latest",
      "@sveltejs/adapter-static": "^3.0.10",
      "@sveltejs/kit": "^2.50.2",
      "@sveltejs/vite-plugin-svelte": "^6.2.4",
      "@tailwindcss/forms": "^0.5.11",
      "@tailwindcss/typography": "^0.5.19",
      "@tailwindcss/vite": "^4.1.18",
      mdsvex: "^0.12.6",
      svelte: "^5.51.0",
      tailwindcss: "^4.1.18",
      typescript: "^5.9.3",
      vite: "^7.3.1",
    },
  };
}

function integrateManifest(manifest: Manifest): Manifest {
  const scripts = { ...manifest.scripts };
  scripts["svartz:dev"] ??= "svartz dev";
  scripts["svartz:build"] ??= "svartz build";
  scripts["svartz:preview"] ??= "svartz preview";
  const devDependencies = { ...manifest.devDependencies };
  for (const name of svartzDependencies) {
    if (!manifest.dependencies?.[name] && !devDependencies[name])
      devDependencies[name] = "latest";
  }
  for (const [name, version] of Object.entries({
    "@tailwindcss/forms": "^0.5.11",
    "@tailwindcss/typography": "^0.5.19",
    tailwindcss: "^4.2.2",
  })) {
    if (!manifest.dependencies?.[name] && !devDependencies[name])
      devDependencies[name] = version;
  }
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
  const hostImport = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@svartz\/vite\/host['"]/g)]
    .flatMap((match) => match[1]!.split(","))
    .map((specifier) => /^withSvartzHost(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(specifier.trim()))
    .find((match) => match !== null);
  let binding = hostImport?.[1] ?? (hostImport ? "withSvartzHost" : "__svartz_with_host");
  if (hostImport && source.includes(`${binding}(`)) return source;
  if (!hostImport) {
    let suffix = 2;
    while (new RegExp(`\\b${binding}\\b`).test(source)) binding = `__svartz_with_host_${suffix++}`;
  }
  const defaultExport = /^([ \t]*)export\s+default\s+/m;
  if (!defaultExport.test(source)) return undefined;
  const hostImportLine = hostImport ? "" : `import { withSvartzHost as ${binding} } from '@svartz/vite/host';\n`;
  return `${hostImportLine}${source.replace(defaultExport, "$1const __svartz_host_config = ")}\nexport default ${binding}(__svartz_host_config);\n`;
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
    const manager = packageManager(root, existingManifest);

    if (location.hostApp) {
      const tailwindVersion = existingManifest?.dependencies?.tailwindcss
        ?? existingManifest?.devDependencies?.tailwindcss;
      if (tailwindVersion && /(?:^|[~^<>=@|\s])3(?:\.|x|\*|\b)/.test(tailwindVersion)) {
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
      const previousAppTypesReference =
        '/// <reference types="@svartz/ui/virtual-modules" />';
      const appTypesSource = existsSync(appTypesPath)
        ? yield* operation("read host app types", () =>
            readFile(appTypesPath, "utf8"),
          )
        : undefined;
      const integratedAppTypes = appTypesSource?.includes(appTypesReference)
        ? appTypesSource
        : appTypesSource?.includes(previousAppTypesReference)
          ? appTypesSource.replace(previousAppTypesReference, appTypesReference)
          : `${appTypesReference}\n${appTypesSource ?? ""}`;
      const catchallRoot = path.join(root, "src", "routes", "[...slug]");
      const catchallPagePath = path.join(catchallRoot, "+page.svelte");
      const catchallLoadPath = path.join(catchallRoot, "+page.ts");
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
      const previousCatchallPage = catchallPageTemplate.replace(
        "  import 'virtual:svartz/tailwind-sources.css';\n",
        "",
      );
      const migrateCatchallPage =
        existsSync(catchallPagePath) &&
        (yield* operation("read host catchall page", () =>
          readFile(catchallPagePath, "utf8"),
        )) === previousCatchallPage;
      const catchallLoadTemplate = yield* operation(
        "read catchall load template",
        () =>
          readFile(
            path.join(templateRoot, "src", "routes", "[...slug]", "+page.ts"),
            "utf8",
          ),
      );
      const previousCatchallLoad = catchallLoadTemplate
        .replace("import { prepareHostVault, routes }", "import { routes }")
        .replace("export const load = async", "export const load =")
        .replace("  await prepareHostVault(pathname);\n", "");
      const migrateCatchall =
        existsSync(catchallLoadPath) &&
        (yield* operation("read host catchall", () =>
          readFile(catchallLoadPath, "utf8"),
        )) === previousCatchallLoad;
      const viteSource = yield* operation("read host Vite config", () =>
        readFile(location.viteConfigPath, "utf8"),
      );
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
      const integratedManifest = integrateManifest(existingManifest ?? {});
      const manifestChanged =
        JSON.stringify(existingManifest) !== JSON.stringify(integratedManifest);
      if (
        existingConfig &&
        integratedViteSource === viteSource &&
        integratedAppTypes === appTypesSource &&
        !manifestChanged &&
        !installCatchall &&
        !migrateRootLayout &&
        !migrateCatchallPage &&
        !migrateCatchall
      ) {
        return { kind: "already-configured", packageManager: manager };
      }
      if (!existingConfig) {
        const vaultPath = path.join(root, "vault");
        if (
          existsSync(vaultPath) &&
          !(yield* operation("inspect vault path", () =>
            stat(vaultPath),
          )).isDirectory()
        ) {
          return yield* new InitConflictError({
            paths: ["vault"],
            message: "Cannot initialize: vault exists and is not a directory.",
          });
        }
        const siteName = existingManifest?.name ?? packageName(root);
        const config = (yield* operation("read config template", () =>
          readFile(path.join(templateRoot, configName), "utf8"),
        )).replace("__SVARTZ_SITE_NAME__", JSON.stringify(siteName));
        const starterNote = path.join(vaultPath, "index.md");
        yield* operation("write Svartz config", () =>
          writeNewFile(path.join(root, configName), config),
        );
        if (!existsSync(starterNote)) {
          const note = yield* operation("read starter note template", () =>
            readFile(path.join(templateRoot, "vault/index.md"), "utf8"),
          );
          yield* operation("write starter note", () =>
            writeNewFile(starterNote, note),
          );
        }
      }
      if (integratedViteSource !== viteSource)
        yield* operation("write host Vite config", () =>
          writeFile(location.viteConfigPath, integratedViteSource),
        );
      if (integratedAppTypes !== appTypesSource) {
        if (appTypesSource === undefined)
          yield* operation("write host app types", () =>
            writeNewFile(appTypesPath, integratedAppTypes),
          );
        else
          yield* operation("update host app types", () =>
            writeFile(appTypesPath, integratedAppTypes),
          );
      }
      if (installCatchall) {
        for (const name of ["+page.svelte", "+page.ts"]) {
          const source = yield* operation(`read ${name} template`, () =>
            readFile(
              path.join(templateRoot, "src", "routes", "[...slug]", name),
              "utf8",
            ),
          );
          yield* operation(`write ${name}`, () =>
            writeNewFile(path.join(catchallRoot, name), source),
          );
        }
      }
      if (migrateCatchall)
        yield* operation("update host catchall load", () =>
          writeFile(catchallLoadPath, catchallLoadTemplate),
        );
      if (migrateCatchallPage)
        yield* operation("update host catchall page", () =>
          writeFile(catchallPagePath, catchallPageTemplate),
        );
      if (migrateRootLayout)
        yield* operation("update host root layout", () =>
          writeFile(rootLayoutPath, rootLayoutTemplate),
        );
      if (manifestChanged)
        yield* operation("write package.json", () =>
          writeFile(
            existingManifestPath,
            `${JSON.stringify(integratedManifest, null, 2)}\n`,
          ),
        );
      if (options.install !== false) yield* command(manager, ["install"], root);
      return { kind: "integrated", packageManager: manager };
    }

    if (existingConfig) {
      if (existsSync(location.viteConfigPath))
        return { kind: "already-configured", packageManager: manager };
      return yield* new InitLayoutError({
        reason: "missing-kit",
        message:
          "Cannot initialize: Svartz config exists, but no SvelteKit app was found. No files changed.",
      });
    }

    const files = yield* operation("list scaffold templates", () =>
      templateFiles(),
    );
    const destinationName = (name: string) =>
      name === "gitignore" ? ".gitignore" : name;
    const destinations = [...files.map(destinationName), "package.json"];
    const conflicts = [
      ...destinations.filter((name) => existsSync(path.join(root, name))),
      ...(yield* operation("inspect scaffold destinations", () =>
        nonDirectoryAncestors(root, destinations),
      )),
    ];
    if (conflicts.length)
      return yield* new InitConflictError({
        paths: conflicts,
        message: `Cannot initialize: these files already exist: ${conflicts.join(", ")}`,
      });
    const siteName = packageName(root);
    for (const name of files) {
      const content = (yield* operation(`read ${name} template`, () =>
        readFile(path.join(templateRoot, name), "utf8"),
      )).replaceAll("__SVARTZ_SITE_NAME__", JSON.stringify(siteName));
      yield* operation(`write ${destinationName(name)}`, () =>
        writeNewFile(path.join(root, destinationName(name)), content),
      );
    }
    yield* operation("write package.json", () =>
      writeNewFile(
        existingManifestPath,
        `${JSON.stringify(freshManifest(root), null, 2)}\n`,
      ),
    );
    if (options.git !== false && !insideGitWorktree(root))
      yield* command("git", ["init"], root);
    if (options.install !== false) yield* command(manager, ["install"], root);
    return { kind: "created", packageManager: manager };
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
