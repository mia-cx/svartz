import { defineRenderer, schemaRenderer } from '@svartz/ui/reference/runtime';
import { readMcpTool, TOOL_BADGE } from './mcp.js';
import McpToolExamples from './McpToolExamples.svelte';
import McpToolPage from './McpToolPage.svelte';

/** `operation.protocol: mcp`: one MCP tool per page. */
export const mcpToolRenderer = defineRenderer({
	id: 'mcp',
	read: readMcpTool,
	nav: (tool) => ({ badge: TOOL_BADGE, label: tool.name, sort: [1, tool.name, 0] }),
	page: McpToolPage,
	examples: McpToolExamples
});

/** MCP tools and shared schemas. */
export const mcpRenderers = [mcpToolRenderer, schemaRenderer] as const;
