/** Who the wiki theme is, shared by its runtime and build extensions. The release script keeps `version` in step with the package. */
export const wikiIdentity = {
	id: '@svartz/theme-wiki',
	name: 'wiki',
	displayName: 'Svartz Wiki',
	description: 'A wiki: infoboxes, categories, recent changes, and references.',
	version: '2.1.0',
} as const;
