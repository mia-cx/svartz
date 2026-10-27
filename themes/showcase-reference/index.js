// Build manifest: the API and MCP themes composed on theme-minimal.
import { extensions as api } from '@svartz/theme-api-docs';
import { extensions as mcp } from '@svartz/theme-mcp-docs';
import { composeThemes } from '@svartz/theme-minimal';

const identity = { id: '@svartz/showcase-reference-theme', displayName: 'Harbour developer docs' };

/** @param {import('@svartz/ui/reference').ReferenceThemeConfig} [config] */
export default (config) => composeThemes([...api, ...mcp], config, identity);
