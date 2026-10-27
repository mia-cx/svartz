import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeBuildExtension } from '@svartz/theme-minimal';
import { identity, type McpDocsThemeConfig } from './manifest.js';

export type { JsonRpcError, McpContentBlock, McpTool, McpToolAnnotations, McpToolExample, McpToolResult } from './mcp.js';
export type { McpDocsThemeConfig } from './manifest.js';

/** The Node-safe extension the build composes. */
export const extensions: readonly ThemeBuildExtension[] = [identity];

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: McpDocsThemeConfig) => composeThemes(extensions, config));
