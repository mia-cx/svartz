import type { ReferenceThemeConfig, ReferenceThemeIdentity } from '@svartz/ui/reference';

/** The vault's `theme` settings for MCP docs. */
export interface McpDocsThemeConfig extends ReferenceThemeConfig {
	/** Joined to a tool's `endpoint` when the endpoint is a path (`/mcp`). */
	baseUrl?: string;
}

export const identity: ReferenceThemeIdentity = {
	id: '@svartz/theme-mcp-docs',
	displayName: 'Svartz MCP Docs',
	description: 'MCP server reference docs: tools, their schemas, annotations, and tools/call examples.',
	version: '1.1.0',
};
