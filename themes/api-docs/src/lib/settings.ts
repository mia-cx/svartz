/** The API renderers' own `theme` settings. */
export interface ApiSettings {
	/** Base URL for REST request examples. Default `"https://api.example.com"`. */
	readonly baseUrl: string;
	/** GraphQL endpoint for query examples. Default `"{baseUrl}/graphql"`. */
	readonly graphqlEndpoint: string;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

export function apiSettings(themeConfig: Readonly<Record<string, unknown>>): ApiSettings {
	const baseUrl = text(themeConfig.baseUrl) ?? 'https://api.example.com';
	return { baseUrl, graphqlEndpoint: text(themeConfig.graphqlEndpoint) ?? `${baseUrl.replace(/\/$/, '')}/graphql` };
}
