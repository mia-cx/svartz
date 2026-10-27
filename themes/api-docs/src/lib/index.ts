import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeBuildExtension } from '@svartz/theme-minimal';
import { identity, type ApiDocsThemeConfig } from './manifest.js';

export type {
	ApiOperation,
	ApiParameter,
	ApiResponse,
	GraphqlOperation,
	RestOperation,
	SchemaNode,
	SocketMessage,
	WebSocketOperation
} from './api.js';
export type { ApiDocsRouteConfig, ApiDocsThemeConfig } from './manifest.js';

/** The Node-safe extension the build composes. */
export const extensions: readonly ThemeBuildExtension[] = [identity];

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: ApiDocsThemeConfig) => composeThemes(extensions, config));
