import { describe, expect, it } from 'vitest';
import { defineRenderer, referencePage, registerRenderers, type ReferenceRenderer } from './renderers.js';

const renderer = (id: string, read: ReferenceRenderer['read'] = (properties) => properties.operation ?? properties.model) =>
	defineRenderer({ id, read, nav: () => ({ label: id, sort: [1, id, 0] }), page: (() => {}) as never });

const registry = registerRenderers('@acme/docs', [renderer('rest'), renderer('mcp'), renderer('schema')]);
const page = (properties: Record<string, unknown>) => referencePage(registry, { path: 'reference/thing.md', slug: 'reference/thing', properties });

describe('referencePage', () => {
	it.each([
		['a page without reference metadata is a guide', {}, undefined],
		['operation.protocol names the renderer', { operation: { protocol: 'mcp', kind: 'tool' } }, 'mcp'],
		['an operation without a protocol is REST, as in the first API theme', { operation: { method: 'GET', path: '/pets' } }, 'rest'],
		['a model block is a schema page', { model: { name: 'Pet' } }, 'schema']
	])('%s', (_, properties, id) => {
		expect(page(properties)?.renderer.id).toBe(id);
	});

	it.each([
		['both kinds of metadata', { operation: { protocol: 'rest' }, model: { name: 'Pet' } }, 'has both `operation` and `model`'],
		['a protocol without a renderer', { operation: { protocol: 'grpc' } }, 'no renderer handles `operation.protocol: grpc`. This theme renders rest, mcp, schema.'],
		['metadata its renderer rejects', { operation: { protocol: 'rest', method: 'FETCH' } }, "isn't a valid rest page"]
	])('names the page and the reason for %s', (_, properties, reason) => {
		const strict = registerRenderers('@acme/docs', [renderer('rest', () => undefined), renderer('mcp'), renderer('schema')]);
		expect(() => referencePage(strict, { path: 'reference/thing.md', slug: 'reference/thing', properties })).toThrow(
			`"reference/thing.md" can't render: `
		);
		expect(() => referencePage(strict, { path: 'reference/thing.md', slug: 'reference/thing', properties })).toThrow(reason);
	});
});

describe('registerRenderers', () => {
	it('accepts one renderer listed twice, so presets can share the schema renderer', () => {
		const schema = renderer('schema');
		expect([...registerRenderers('@acme/docs', [schema, renderer('rest'), schema]).keys()]).toEqual(['schema', 'rest']);
	});

	it('rejects two different renderers for one id, naming the theme and the id', () => {
		expect(() => registerRenderers('@acme/docs', [renderer('rest'), renderer('rest')])).toThrow(
			'Theme "@acme/docs" has two renderers for "rest".'
		);
	});
});
