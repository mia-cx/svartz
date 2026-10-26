import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import SchemaTree from './SchemaTree.svelte';
import { readSchema } from './schema.js';

it("nests a map's value fields under its key, not beside the map's own fields", () => {
	const schema = readSchema({
		type: 'object',
		properties: {
			pets: { type: 'object', additionalProperties: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } }
		}
	})!;
	const { body } = render(SchemaTree, { props: { schema, schemaHref: () => undefined, entries: [] } });
	const text = body.replace(/<!--[^]*?-->/g, '');

	// pets > [key: string] > id: three levels, so `id` is two nested lists deep.
	expect(text).toMatch(/pets<\/code>.*map of object/s);
	expect(text).toMatch(/pets<\/code>.*nested">.*\[key: string\]<\/code>.*nested">.*id<\/code>/s);
});
