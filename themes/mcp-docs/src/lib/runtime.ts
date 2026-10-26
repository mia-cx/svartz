import { defineTheme } from '@svartz/core';
import { referenceTheme } from '@svartz/ui/reference/runtime';
import { identity, type McpDocsThemeConfig } from './manifest.js';
import { mcpRenderers } from './renderers.js';

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: McpDocsThemeConfig) => referenceTheme({ ...identity, renderers: mcpRenderers }, config));

export { readMcpTool } from './mcp.js';
export { mcpRenderers, mcpToolRenderer } from './renderers.js';
export { theme };
export default theme;
