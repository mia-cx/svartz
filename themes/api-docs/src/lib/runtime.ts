import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeExtension } from '@svartz/theme-minimal/runtime';
import { referenceExtension } from '@svartz/ui/reference/runtime';
import { identity, type ApiDocsThemeConfig } from './manifest.js';
import { apiRenderers } from './renderers.js';

/** REST, GraphQL, and schema pages on theme-minimal, with the reference frame. Compose them with other themes' extensions. */
export const extensions: readonly ThemeExtension[] = [referenceExtension(identity, apiRenderers)];

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: ApiDocsThemeConfig) => composeThemes(extensions, config));

export { apiRenderers, graphqlRenderer, restRenderer } from './renderers.js';
export { theme };
export default theme;
