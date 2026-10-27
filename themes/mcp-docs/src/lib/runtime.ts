import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeExtension } from '@svartz/theme-minimal/runtime';
import { referenceExtension } from '@svartz/ui/reference/runtime';
import { identity, type McpDocsThemeConfig } from './manifest.js';
import { mcpRenderers } from './renderers.js';

/** MCP tool and schema pages on theme-minimal, with the reference frame. Compose them with other themes' extensions. */
export const extensions: readonly ThemeExtension[] = [referenceExtension(identity, mcpRenderers)];

/** Vite-bundled runtime manifest. */
const theme = defineTheme((config?: McpDocsThemeConfig) => composeThemes(extensions, config));

export { readMcpTool } from './mcp.js';
export { mcpRenderers, mcpToolRenderer } from './renderers.js';
export { theme };
export default theme;
