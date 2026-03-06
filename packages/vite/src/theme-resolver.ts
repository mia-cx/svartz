import { validateTheme, type ResolvedConfig, type SvartzTheme } from "@svartz/core";

type ThemeModule = Record<string, unknown> & {
  default?: SvartzTheme;
  theme?: SvartzTheme;
};

function resolveThemeModuleId(config: ResolvedConfig): string {
  return config.theme.base;
}

function resolveThemeExport(themeModule: ThemeModule): SvartzTheme {
  const theme = themeModule.default ?? themeModule.theme ?? (themeModule as unknown as SvartzTheme);
  validateTheme(theme);
  return theme;
}

async function loadThemeModule(
  loader: (id: string) => Promise<unknown>,
  config: ResolvedConfig,
): Promise<SvartzTheme> {
  const themeModule = (await loader(resolveThemeModuleId(config))) as ThemeModule;
  return resolveThemeExport(themeModule);
}

function createThemeVirtualModuleSource(themeModuleId: string): string {
  return [
    `import * as themeModule from ${JSON.stringify(themeModuleId)};`,
    'import { matchThemeRoute, resolveThemeRouteToArtifactKey } from "@svartz/core";',
    "",
    "export const theme = themeModule.default ?? themeModule.theme ?? themeModule;",
    "export const routes = theme.routes;",
    "",
    "export function resolveRuntimeRoute(input) {",
    "  return matchThemeRoute(routes, input);",
    "}",
    "",
    "export function resolveRouteToArtifactKey(input) {",
    "  return resolveThemeRouteToArtifactKey(routes, input);",
    "}",
  ].join("\\n");
}

export {
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemeExport,
  resolveThemeModuleId,
};
export type { ThemeModule };
