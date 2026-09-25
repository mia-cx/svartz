import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateTheme, type ResolvedConfig, type SvartzTheme } from "@svartz/core";
import { createJiti } from "jiti";

type ThemeModule = Record<string, unknown> & {
  default?: SvartzTheme | ((config?: Record<string, unknown>) => SvartzTheme);
  theme?: SvartzTheme | ((config?: Record<string, unknown>) => SvartzTheme);
};

const BUILTIN_THEME_MODULE_ID = "@svartz/theme-minimal";
const BUILTIN_THEME_RUNTIME_MODULE_ID = `${BUILTIN_THEME_MODULE_ID}/runtime`;

function resolveThemeModuleId(config: ResolvedConfig): string {
  return config.theme.base;
}

function createRequireFromDirectory(resolveFromDirectory: string) {
  return createRequire(path.join(resolveFromDirectory, "__svartz_theme_resolver__.js"));
}

function resolveThemeEntry(moduleId: string, resolveFromDirectory: string): string {
  try {
    return createRequireFromDirectory(resolveFromDirectory).resolve(moduleId);
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

function resolveThemeRuntimeImportId(
  config: ResolvedConfig,
  resolveFromDirectory = process.cwd(),
): string {
  const themeModuleId = resolveThemeModuleId(config);
  if (themeModuleId === BUILTIN_THEME_MODULE_ID) {
    return pathToFileURL(resolveThemeEntry(BUILTIN_THEME_RUNTIME_MODULE_ID, resolveFromDirectory)).href;
  }
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

function resolveThemeBuildImportId(
  config: ResolvedConfig,
  resolveFromDirectory = process.cwd(),
): string {
  const themeModuleId = resolveThemeModuleId(config);
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
    return resolvePackageRootFromEntry(createRequireFromDirectory(resolveFromDirectory).resolve(moduleId));
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

async function loadThemeModule(
  loader: (id: string) => Promise<unknown>,
  config: ResolvedConfig,
  resolveFromDirectory = process.cwd(),
  sourcePath?: string,
): Promise<SvartzTheme> {
  const themeModule = (sourcePath
    ? await createJiti(import.meta.url, { moduleCache: false }).import(sourcePath)
    : await loader(resolveThemeBuildImportId(config, resolveFromDirectory))) as ThemeModule;
  const { base: _base, ...themeConfig } = config.theme;
  return resolveThemeExport(themeModule, themeConfig);
}

/**
 * Generates the `virtual:svartz/theme` module source.
 *
 * If the theme module exports a factory function, it is called with themeConfig
 * at module evaluation time so route patterns reflect vault-level configuration.
 */
function createThemeVirtualModuleSource(
  themeModuleId: string,
  themeConfig: Record<string, unknown> = {},
): string {
  // Generated files live under the host project, which may not install core directly.
  const coreModuleId = typeof import.meta.resolve === "function"
    ? fileURLToPath(import.meta.resolve("@svartz/core"))
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/@svartz/core/dist/index.js");
  return [
    `import * as themeModule from ${JSON.stringify(themeModuleId)};`,
    `import { matchThemeRoute, materializeTheme, resolveThemeRouteToArtifactKey } from ${JSON.stringify(coreModuleId)};`,
    "",
    `const _themeConfig = ${JSON.stringify(themeConfig)};`,
    "const _themeExport = themeModule.default ?? themeModule.theme ?? themeModule;",
    "const _manifest = typeof _themeExport === 'function' ? _themeExport(_themeConfig) : _themeExport;",
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
  resolveThemeModuleId,
  resolveThemePackageRoot,
  resolveThemeRuntimeImportId,
};
export type { ThemeModule };
