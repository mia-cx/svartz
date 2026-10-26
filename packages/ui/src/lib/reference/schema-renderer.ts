import SchemaExamples from './SchemaExamples.svelte';
import SchemaPage from './SchemaPage.svelte';
import { defineRenderer, SCHEMA_RENDERER } from './renderers.js';
import { readModel } from './schema.js';

/**
 * Renders `model` pages: one shared schema per page, which operations and tools
 * name with `$ref`. Every preset includes it; listing it twice is fine.
 */
export const schemaRenderer = defineRenderer({
	id: SCHEMA_RENDERER,
	read: readModel,
	nav: (model) => ({ badge: { label: 'SCHEMA', hue: 'neutral' }, label: model.name, sort: [0, model.name, 0] }),
	page: SchemaPage,
	examples: SchemaExamples
});
