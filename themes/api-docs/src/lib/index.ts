import { defineTheme } from '@svartz/core';
import { referenceTheme } from '@svartz/ui/reference';
import { identity, type ApiDocsThemeConfig } from './manifest.js';

export type {
	ApiOperation,
	ApiParameter,
	ApiResponse,
	GraphqlOperation,
	RestOperation,
	SchemaNode
} from './api.js';
export type { ApiDocsRouteConfig, ApiDocsThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: ApiDocsThemeConfig) => referenceTheme(identity, config));
