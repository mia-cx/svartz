import type { ReferenceThemeConfig, ReferenceThemeIdentity } from '@svartz/ui/reference';

/** The vault's `theme` settings for API docs. */
export interface ApiDocsThemeConfig extends ReferenceThemeConfig {
	/** Base URL for REST request examples. Default `"https://api.example.com"`. */
	baseUrl?: string;
	/** GraphQL endpoint for query examples. Default `"{baseUrl}/graphql"`. */
	graphqlEndpoint?: string;
}

/** Route prefixes, shared by every reference theme. */
export type { ReferenceRouteConfig as ApiDocsRouteConfig } from '@svartz/ui/reference';

export const identity: ReferenceThemeIdentity = {
	id: '@svartz/theme-api-docs',
	name: 'api-docs',
	displayName: 'Svartz API Docs',
	description: 'REST and GraphQL reference docs: operations, schemas, and request examples.',
	version: '2.1.3',
};
