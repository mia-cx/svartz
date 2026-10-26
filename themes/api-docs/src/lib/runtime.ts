import { defineTheme } from '@svartz/core';
import { referenceTheme } from '@svartz/ui/reference/runtime';
import { identity, type ApiDocsThemeConfig } from './manifest.js';
import { apiRenderers } from './renderers.js';

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: ApiDocsThemeConfig) => referenceTheme({ ...identity, renderers: apiRenderers }, config));

export { apiRenderers, graphqlRenderer, restRenderer } from './renderers.js';
export { theme };
export default theme;
