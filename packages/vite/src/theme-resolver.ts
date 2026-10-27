import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateTheme, type ResolvedConfig, type SvartzTheme } from "@svartz/core";
import { createJiti } from "jiti";

type ThemeModule = Record<string, unknown> & {
  default?: SvartzTheme | ((config?: Record<string, unknown>) => SvartzTheme);
  theme?: SvartzTheme | ((config?: Record<string, unknown>) => SvartzTheme);
  extensions?: readonly unknown[];
};

/** theme-minimal's `composeThemes` entry, the composer for a `theme.base` list. */
type ComposerModule = {
  composeThemes: (extensions: readonly unknown[], config?: Record<string, unknown>) => SvartzTheme;
};

/** What `virtual:svartz/theme` imports: one theme module, or several and the `composeThemes` entry that composes them. */
type ThemeImport = string | { readonly compose: string; readonly themes: readonly string[] };

/**
 * Local theme ids mapped to their source manifests (`src/lib/index.ts`), so dev
 * loads unbuilt themes. The CLI passes it as JSON in `SVARTZ_THEME_SOURCES`.
 */
type ThemeSources = Readonly<Record<string, string>>;

const BUILTIN_THEME_MODULE_ID = "@svartz/theme-minimal";
const BUILTIN_THEME_RUNTIME_MODULE_ID = `${BUILTIN_THEME_MODULE_ID}/runtime`;

/** The theme modules a vault lists, in order. */
function resolveThemeModuleIds(config: ResolvedConfig): readonly string[] {
  const { base } = config.theme;
  return typeof base === "string" ? [base] : base;
}

function createRequireFromDirectory(resolveFromDirectory: string) {
  return createRequire(path.join(resolveFromDirectory, "__svartz_theme_resolver__.js"));
}

function importExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(importExportTarget).find((target) => target !== undefined);
  if (!value || typeof value !== "object") return;

  const entries = Object.entries(value);
  const root = entries.find(([key]) => key === ".");
  if (root) return importExportTarget(root[1]);
  if (entries.some(([key]) => key.startsWith("."))) return;

  for (const [condition, target] of entries) {
    if (condition === "import" || condition === "node" || condition === "default") {
      const entry = importExportTarget(target);
      if (entry) return entry;
    }
  }
}

function directoryThemeEntry(moduleId: string, exportKey = "."): string | undefined {
  if (!path.isAbsolute(moduleId) || !existsSync(moduleId) || !statSync(moduleId).isDirectory()) return;
  const manifestPath = path.join(moduleId, "package.json");
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: unknown };
  const exported = exportKey === "."
    ? manifest.exports
    : manifest.exports && typeof manifest.exports === "object" && !Array.isArray(manifest.exports)
      ? (manifest.exports as Record<string, unknown>)[exportKey]
      : undefined;
  const target = importExportTarget(exported);
  if (!target?.startsWith("./")) return;
  return path.resolve(moduleId, target);
}

function resolveThemeEntry(moduleId: string, resolveFromDirectory: string): string {
  try {
    const directoryEntry = directoryThemeEntry(moduleId);
    if (directoryEntry) return directoryEntry;
    const resolver = moduleId === BUILTIN_THEME_MODULE_ID || moduleId.startsWith(`${BUILTIN_THEME_MODULE_ID}/`)
      ? createRequire(import.meta.url)
      : createRequireFromDirectory(resolveFromDirectory);
    return resolver.resolve(moduleId);
  } catch (cause) {
    throw new Error(
      `Could not resolve theme "${moduleId}" from "${resolveFromDirectory}". Check its path or install it in the host app.`,
      { cause },
    );
  }
}

function resolvePackageRootFromEntry(resolvedEntryPath: string): string | undefined {
  let current = path.dirname(resolvedEntryPath);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      return realpathSync(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

/**
 * theme-minimal's build or runtime entry for composing `themeModuleIds`. The host
 * may not install theme-minimal under pnpm's strict layout, but every composable
 * theme depends on it, so the first listed theme's package root resolves it too.
 */
function resolveComposerEntry(
  exportId: typeof BUILTIN_THEME_MODULE_ID | typeof BUILTIN_THEME_RUNTIME_MODULE_ID,
  themeModuleIds: readonly string[],
  resolveFromDirectory: string,
): string {
  const directories = [resolveFromDirectory, resolveThemePackageRoot(themeModuleIds[0]!, resolveFromDirectory)];
  for (const directory of directories) {
    if (!directory) continue;
    try {
      return createRequireFromDirectory(directory).resolve(exportId);
    } catch {
      // Try the next directory; the error below names the composition.
    }
  }
  throw new Error(
    `Could not resolve "${exportId}" to compose ${themeModuleIds.join(", ")}. Install @svartz/theme-minimal in the host app.`,
  );
}

/**
 * The browser entry beside a theme's source manifest. The manifest (index.ts) may
 * import build-time plugins that can't run in the browser; runtime.ts can.
 */
function runtimeThemeSourcePath(manifestPath: string): string | undefined {
  const runtime = path.join(path.dirname(manifestPath), "runtime.ts");
  return existsSync(runtime) ? runtime : undefined;
}

/**
 * What `virtual:svartz/theme` imports for this vault. A theme with a selected
 * source imports its `runtime.ts`, or its package id, which Vite aliases to the source.
 */
function resolveThemeRuntimeImport(
  config: ResolvedConfig,
  resolveFromDirectory = process.cwd(),
  sources: ThemeSources = {},
): ThemeImport {
  const runtimeImport = (themeModuleId: string) => {
    const source = sources[themeModuleId];
    if (source) return runtimeThemeSourcePath(source) ?? themeModuleId;
    return resolveThemeRuntimeImportId(themeModuleId, resolveFromDirectory);
  };
  const { base } = config.theme;
  if (typeof base === "string") return runtimeImport(base);
  return {
    compose: pathToFileURL(resolveComposerEntry(BUILTIN_THEME_RUNTIME_MODULE_ID, base, resolveFromDirectory)).href,
    themes: base.map(runtimeImport),
  };
}

function resolveThemeRuntimeImportId(themeModuleId: string, resolveFromDirectory: string): string {
  if (themeModuleId === BUILTIN_THEME_MODULE_ID) {
    return pathToFileURL(resolveThemeEntry(BUILTIN_THEME_RUNTIME_MODULE_ID, resolveFromDirectory)).href;
  }
  const exportedRuntime = directoryThemeEntry(themeModuleId, "./runtime");
  if (exportedRuntime) return pathToFileURL(exportedRuntime).href;
  const packageRoot = resolveThemePackageRoot(themeModuleId, resolveFromDirectory);
  if (packageRoot && (themeModuleId.startsWith("/") || themeModuleId.startsWith("."))) {
    const runtime = path.join(packageRoot, "dist/runtime.js");
    if (existsSync(runtime)) return pathToFileURL(runtime).href;
  }
  try {
    return pathToFileURL(resolveThemeEntry(`${themeModuleId}/runtime`, resolveFromDirectory)).href;
  } catch {
    return pathToFileURL(resolveThemeEntry(themeModuleId, resolveFromDirectory)).href;
  }
}

function resolveThemeBuildImportId(themeModuleId: string, resolveFromDirectory: string): string {
  if (themeModuleId === BUILTIN_THEME_MODULE_ID) {
    return themeModuleId;
  }

  return pathToFileURL(resolveThemeEntry(themeModuleId, resolveFromDirectory)).href;
}

/** Find a package root from the host app for Vite, CLI, and Tailwind consumers. */
function resolveThemePackageRoot(
  moduleId: string,
  resolveFromDirectory = process.cwd(),
): string | undefined {
  try {
    return resolvePackageRootFromEntry(resolveThemeEntry(moduleId, resolveFromDirectory));
  } catch {
    return undefined;
  }
}

function resolveThemeExport(
  themeModule: ThemeModule,
  themeConfig: Record<string, unknown> = {},
): SvartzTheme {
  const raw = themeModule.default ?? themeModule.theme ?? themeModule;
  // Theme may export a factory function (receives themeConfig) or a static manifest.
  const theme =
    typeof raw === "function"
      ? (raw as (config?: Record<string, unknown>) => SvartzTheme)(themeConfig)
      : (raw as SvartzTheme);
  validateTheme(theme);
  return theme;
}

/** A listed theme's extensions: a list composes only themes that export them. */
function themeExtensions(themeModule: ThemeModule, themeModuleId: string): readonly unknown[] {
  if (Array.isArray(themeModule.extensions)) return themeModule.extensions;
  throw new Error(`Theme "${themeModuleId}" isn't a composable theme; it exports no \`extensions\`.`);
}

/**
 * The vault's build manifest. A `theme.base` list composes every listed theme's
 * `extensions` with theme-minimal's `composeThemes`; a theme with a selected
 * source loads unbuilt.
 */
async function loadThemeModule(
  loader: (id: string) => Promise<unknown>,
  config: ResolvedConfig,
  resolveFromDirectory = process.cwd(),
  sources: ThemeSources = {},
): Promise<SvartzTheme> {
  const importTheme = async (themeModuleId: string) => {
    const source = sources[themeModuleId];
    return (source
      ? await createJiti(import.meta.url, { moduleCache: false }).import(source)
      : await loader(resolveThemeBuildImportId(themeModuleId, resolveFromDirectory))) as ThemeModule;
  };
  const { base, ...themeConfig } = config.theme;
  if (typeof base === "string") return resolveThemeExport(await importTheme(base), themeConfig);

  const themeModules = await Promise.all(base.map(importTheme));
  const extensions = themeModules.flatMap((themeModule, index) => themeExtensions(themeModule, base[index]!));
  const composer = pathToFileURL(resolveComposerEntry(BUILTIN_THEME_MODULE_ID, base, resolveFromDirectory)).href;
  const { composeThemes } = await loader(composer) as ComposerModule;
  const theme = composeThemes(extensions, themeConfig);
  validateTheme(theme);
  return theme;
}

/** Source lines that import the theme and bind `_manifest` to its manifest for `themeConfig`. */
function manifestSource(themeImport: ThemeImport, themeConfig: Record<string, unknown>): string[] {
  const config = `const _themeConfig = ${JSON.stringify(themeConfig)};`;
  if (typeof themeImport === "string") {
    return [
      `import * as themeModule from ${JSON.stringify(themeImport)};`,
      config,
      "const _themeExport = themeModule.default ?? themeModule.theme ?? themeModule;",
      "const _manifest = typeof _themeExport === 'function' ? _themeExport(_themeConfig) : _themeExport;",
    ];
  }
  const { compose, themes } = themeImport;
  return [
    `import { composeThemes } from ${JSON.stringify(compose)};`,
    ...themes.map((id, index) => `import * as themeModule${index} from ${JSON.stringify(id)};`),
    config,
    `const _manifest = composeThemes([${themes.map((_, index) => `...themeModule${index}.extensions`).join(", ")}], _themeConfig);`,
  ];
}

/**
 * Generates the `virtual:svartz/theme` module source.
 *
 * If the theme module exports a factory function, it is called with themeConfig
 * at module evaluation time so route patterns reflect vault-level configuration.
 * Several theme modules compose their `extensions` on theme-minimal's shell.
 */
function createThemeVirtualModuleSource(
  themeImport: ThemeImport,
  themeConfig: Record<string, unknown> = {},
): string {
  // Generated files live under the host project, which may not install core directly.
  const coreModuleId = typeof import.meta.resolve === "function"
    ? fileURLToPath(import.meta.resolve("@svartz/core"))
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/@svartz/core/dist/index.js");
  return [
    `import { matchThemeRoute, materializeTheme, resolveThemeRouteToArtifactKey } from ${JSON.stringify(coreModuleId)};`,
    ...manifestSource(themeImport, themeConfig),
    "",
    "export let theme = _manifest;",
    "export let routes = theme.routes;",
    "export const ready = materializeTheme(_manifest).then((resolved) => {",
    "  theme = resolved;",
    "  routes = resolved.routes;",
    "});",
    "",
    "export function resolveRuntimeRoute(input) {",
    "  return matchThemeRoute(routes, input);",
    "}",
    "",
    "export function resolveRouteToArtifactKey(input) {",
    "  return resolveThemeRouteToArtifactKey(routes, input);",
    "}",
  ].join("\n");
}

export {
  createThemeVirtualModuleSource,
  loadThemeModule,
  BUILTIN_THEME_MODULE_ID,
  resolveThemeExport,
  resolveThemeModuleIds,
  resolveThemePackageRoot,
  resolveThemeRuntimeImport,
};
export type { ThemeImport, ThemeModule, ThemeSources };
