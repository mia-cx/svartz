// Runtime manifest: the API and MCP themes composed on theme-minimal. Each page's metadata picks its renderer.
import { extensions as api } from '@svartz/theme-api-docs/runtime';
import { extensions as mcp } from '@svartz/theme-mcp-docs/runtime';
import { composeThemes } from '@svartz/theme-minimal/runtime';

const identity = { id: '@svartz/showcase-reference-theme', displayName: 'Harbour developer docs' };

/** @param {import('@svartz/ui/reference').ReferenceThemeConfig} [config] */
export const theme = (config) => composeThemes([...api, ...mcp], config, identity);

export default theme;
