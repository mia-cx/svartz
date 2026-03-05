import type { SvartzTheme } from "./types";
import { CONTRACT_VERSION } from "./types";
import { ThemeValidationError } from "./errors";

type ThemeFactory<
  T extends Record<string, unknown> = Record<string, never>,
> = (options?: T) => SvartzTheme;

const KNOWN_THEME_KEYS = new Set<string>([
  "id",
  "version",
  "contractVersion",
  "layouts",
  "routes",
  "displayName",
  "description",
  "author",
  "homepage",
  "components",
  "capabilities",
  "artifactRequirements",
  "pluginPreset",
  "defaults",
  "hooks",
]);

function validateTheme(theme: SvartzTheme): void {
  if (!theme.id || typeof theme.id !== "string") {
    throw new ThemeValidationError({
      themeId: theme.id ?? "<missing>",
      message: "Theme id must be a non-empty string",
    });
  }

  if (!theme.version || typeof theme.version !== "string") {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: "Theme version must be a non-empty string",
    });
  }

  if (!theme.contractVersion || typeof theme.contractVersion !== "string") {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: "Theme contractVersion must be a non-empty string",
    });
  }

  const expectedMajor = CONTRACT_VERSION.split(".")[0];
  const actualMajor = theme.contractVersion.split(".")[0];
  if (expectedMajor !== actualMajor) {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: `Theme contractVersion major "${actualMajor}" does not match expected "${expectedMajor}" (contract ${CONTRACT_VERSION})`,
    });
  }

  if (!theme.layouts || typeof theme.layouts !== "object") {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: "Theme must include a layouts map",
    });
  }

  if (!theme.layouts.defaultPage) {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: 'Theme layouts must include a "defaultPage" slot',
    });
  }

  if (!theme.layouts.notePage) {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: 'Theme layouts must include a "notePage" slot',
    });
  }

  if (!Array.isArray(theme.routes) || theme.routes.length === 0) {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: "Theme must include at least one route",
    });
  }

  const noteRoute = theme.routes.find((r) => r.id === "note");
  if (!noteRoute) {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: 'Theme routes must include a route with id "note"',
    });
  }

  if (!noteRoute.pattern.includes(":slug")) {
    throw new ThemeValidationError({
      themeId: theme.id,
      message: 'Theme note route pattern must contain a ":slug" segment',
    });
  }

  for (const key of Object.keys(theme)) {
    if (!KNOWN_THEME_KEYS.has(key)) {
      console.warn(
        `[svartz:theme] theme "${theme.id}" has unknown key "${key}"`,
      );
    }
  }
}

/**
 * Define a theme with runtime validation.
 * Accepts either a static theme object or a factory function.
 * Returns a callable factory that validates the manifest on each invocation.
 */
function defineTheme(theme: SvartzTheme): () => SvartzTheme;
function defineTheme<
  T extends Record<string, unknown> = Record<string, never>,
>(
  factoryOrTheme: ThemeFactory<T> | SvartzTheme,
): (options?: T) => SvartzTheme {
  return (options) => {
    const themeInstance =
      typeof factoryOrTheme === "function"
        ? factoryOrTheme(options)
        : { ...factoryOrTheme };
    validateTheme(themeInstance);
    return themeInstance;
  };
}

export { defineTheme, validateTheme, type ThemeFactory };
