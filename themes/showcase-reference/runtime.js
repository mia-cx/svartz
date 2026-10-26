// Runtime manifest: the shared shell with the API and MCP renderers. Each page's metadata picks one.
import { apiRenderers } from '@svartz/theme-api-docs/runtime';
import { mcpRenderers } from '@svartz/theme-mcp-docs/runtime';
import { referenceTheme } from '@svartz/ui/reference/runtime';

/** @param {import('@svartz/ui/reference').ReferenceThemeConfig} [config] */
export const theme = (config) =>
	referenceTheme(
		{ id: '@svartz/showcase-reference-theme', displayName: 'Harbour developer docs', renderers: [...apiRenderers, ...mcpRenderers] },
		config
	);

export default theme;
