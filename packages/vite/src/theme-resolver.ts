import { validateTheme, type ResolvedConfig, type SvartzTheme } from "@svartz/core";

type ThemeModule = Record<string, unknown> & {
  default?: SvartzTheme | ((config?: Record<string, unknown>) => SvartzTheme);
  theme?: SvartzTheme | ((config?: Record<string, unknown>) => SvartzTheme);
};

function resolveThemeModuleId(config: ResolvedConfig): string {
  return config.theme.base;
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
): Promise<SvartzTheme> {
  const themeModule = (await loader(resolveThemeModuleId(config))) as ThemeModule;
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
  return [
    `import * as themeModule from ${JSON.stringify(themeModuleId)};`,
    'import { matchThemeRoute, resolveThemeRouteToArtifactKey } from "@svartz/core";',
    "",
    `const _themeConfig = ${JSON.stringify(themeConfig)};`,
    "const _themeExport = themeModule.default ?? themeModule.theme ?? themeModule;",
    "export const theme = typeof _themeExport === 'function' ? _themeExport(_themeConfig) : _themeExport;",
    "export const routes = theme.routes;",
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
  resolveThemeExport,
  resolveThemeModuleId,
};
export type { ThemeModule };
