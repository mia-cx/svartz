import { describe, expect, it } from 'vitest';
import { referenceRenderer } from './adapter.js';
import { defineRenderer, rendererIdOf, type ReferenceRenderer } from './renderers.js';

const renderer = (id: string, read: ReferenceRenderer['read'] = (properties) => properties.operation ?? properties.model) =>
	defineRenderer({ id, read, nav: () => ({ label: id, sort: [1, id, 0] }), page: (() => {}) as never });

const entry = (properties: Record<string, unknown>) => ({ path: 'reference/thing.md', slug: 'reference/thing', properties }) as never;

describe('rendererIdOf', () => {
	it.each([
		['a page without reference metadata is a guide', {}, undefined],
		['operation.protocol names the renderer', { operation: { protocol: 'mcp', kind: 'tool' } }, 'mcp'],
		['an operation without a protocol is REST, as in the first API theme', { operation: { method: 'GET', path: '/pets' } }, 'rest'],
		['a model block is a schema page', { model: { name: 'Pet' } }, 'schema']
	])('%s', (_, properties, id) => {
		expect(rendererIdOf(properties)).toBe(id);
	});

	it('rejects a page with both kinds of metadata', () => {
		expect(() => rendererIdOf({ operation: { protocol: 'rest' }, model: { name: 'Pet' } })).toThrow('has both `operation` and `model`');
	});
});

describe('referenceRenderer', () => {
	it('claims only the pages its protocol names, with the data its renderer reads', () => {
		const rest = referenceRenderer(renderer('rest'));
		expect(rest.detect({ operation: { method: 'GET' } }, entry({}))).toEqual({ method: 'GET' });
		expect(rest.detect({ operation: { protocol: 'mcp' } }, entry({}))).toBeUndefined();
		expect(rest.detect({}, entry({}))).toBeUndefined();
	});

	it('gives the reason when its renderer rejects a page it claims', () => {
		const strict = referenceRenderer(renderer('rest', () => undefined));
		expect(() => strict.detect({ operation: { method: 'FETCH' } }, entry({}))).toThrow("isn't a valid rest page");
	});

	it('adapts one renderer to one page renderer, so themes sharing the schema renderer make one claim', () => {
		const schema = renderer('schema');
		expect(referenceRenderer(schema)).toBe(referenceRenderer(schema));
		expect(referenceRenderer(schema)).not.toBe(referenceRenderer(renderer('schema')));
	});
});
