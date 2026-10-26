import { defineTheme } from '@svartz/core';
import { referenceTheme } from '@svartz/ui/reference';
import { identity, type McpDocsThemeConfig } from './manifest.js';

export type { JsonRpcError, McpContentBlock, McpTool, McpToolAnnotations, McpToolExample, McpToolResult } from './mcp.js';
export type { McpDocsThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: McpDocsThemeConfig) => referenceTheme(identity, config));
