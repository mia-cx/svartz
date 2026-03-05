import type { Schema } from "effect";
import type { TailwindThemeConfigSchema } from "./schema";

type TailwindThemeConfig = Schema.Schema.Type<
  typeof TailwindThemeConfigSchema
>;

/**
 * Default Tailwind theme override keys for better tab completion / IntelliSense when customizing theme.
 * Schema validation accepts any Tailwind theme keys; this type hints the common ones.
 * Theme packages (e.g. @svartz/theme-minimal) can export their own override type for even better hints.
 * To narrow the `theme` property, add a JSDoc @type on it (e.g. @type {MinimalThemeConfig}).
 */
interface DefaultThemeOverrideHints {
  colors?: {
    brand?: string;
    accent?: string;
    [key: string]: string | Record<string, string> | undefined;
  };
  fontFamily?: Record<string, string | string[]> | string[];
  fontSize?: Record<string, string | [string, { lineHeight?: string }]>;
  spacing?: Record<string, string>;
  screens?: Record<string, string>;
  borderRadius?: Record<string, string>;
  boxShadow?: Record<string, string> | string[];
  [key: string]: unknown;
}

export { type TailwindThemeConfig, type DefaultThemeOverrideHints };
