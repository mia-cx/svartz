import { describe, expect, it } from 'vitest';
import { apiNav, exampleFromSchema, readModel, readOperation, readSchema, requestSnippets } from './api.js';

const petSchema = {
	type: 'object',
	required: ['id', 'name'],
	properties: {
		id: { type: 'string', format: 'uuid' },
		name: { type: 'string', example: 'Biscuit' },
		status: { type: 'string', enum: ['available', 'adopted'] },
		tags: { type: 'array', items: { type: 'string' } },
		owner: { $ref: 'Owner' }
	}
};

describe('readSchema', () => {
	it('reads nested properties with required flags, enums, formats, and refs', () => {
		const schema = readSchema(petSchema)!;
		expect(schema.type).toBe('object');
		expect(schema.properties?.map((property) => [property.name, property.required])).toEqual([
			['id', true],
			['name', true],
			['status', false],
			['tags', false],
			['owner', false]
		]);
		expect(schema.properties?.[2]?.schema.enum).toEqual(['available', 'adopted']);
		expect(schema.properties?.[3]?.schema.items?.type).toBe('string');
		expect(schema.properties?.[4]?.schema.ref).toBe('Owner');
	});
});

describe('exampleFromSchema', () => {
	it('builds a representative value, preferring examples and enums, resolving refs', () => {
		const models = { Owner: readSchema({ type: 'object', properties: { email: { type: 'string', format: 'email' } } })! };
		expect(exampleFromSchema(readSchema(petSchema)!, models)).toEqual({
			id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
			name: 'Biscuit',
			status: 'available',
			tags: ['string'],
			owner: { email: 'user@example.com' }
		});
	});

	it('stops at recursive refs', () => {
		const models = { Node: readSchema({ type: 'object', properties: { next: { $ref: 'Node' } } })! };
		expect(exampleFromSchema(readSchema({ $ref: 'Node' })!, models)).toEqual({ next: {} });
	});
});

describe('readOperation', () => {
	it('reads a REST operation, uppercasing the method and ordering responses', () => {
		const operation = readOperation({
			operation: {
				protocol: 'rest',
				method: 'post',
				path: '/pets/{petId}/photos',
				auth: 'bearer',
				parameters: [{ name: 'petId', in: 'path', type: 'string', required: true, example: 'p_42' }],
				requestBody: { schema: { type: 'object', properties: { url: { type: 'string' } } } },
				responses: { 404: { description: 'No such pet' }, 201: { description: 'Created', schema: { $ref: 'Photo' } } }
			}
		});
		expect(operation).toMatchObject({ protocol: 'rest', method: 'POST', path: '/pets/{petId}/photos', auth: 'bearer' });
		expect(operation?.protocol === 'rest' && operation.responses.map((response) => response.status)).toEqual(['201', '404']);
	});

	it('reads a GraphQL operation', () => {
		expect(
			readOperation({ operation: { protocol: 'graphql', kind: 'query', name: 'pet', returns: '[[Pet]]', args: [{ name: 'id', type: 'ID!', required: true }] } })
		).toMatchObject({ protocol: 'graphql', kind: 'query', name: 'pet', returns: '[[Pet]]' });
	});

	it('rejects unknown methods and missing paths', () => {
		expect(readOperation({ operation: { protocol: 'rest', method: 'fetch', path: '/x' } })).toBeUndefined();
		expect(readOperation({ operation: { protocol: 'rest', method: 'get' } })).toBeUndefined();
		expect(readModel({ model: { name: 'Pet' } })).toBeUndefined();
	});
});

describe('apiNav', () => {
	const note = (slug: string, properties: Record<string, unknown> = {}) => ({
		slug,
		title: slug.split('/').at(-1)!,
		href: `/${slug}/`,
		properties
	});

	it('puts guides first, then resources with models before operations in path and method order', () => {
		const nav = apiNav(
			[
				note('index'),
				note('guides/authentication'),
				note('pets/delete-pet', { operation: { protocol: 'rest', method: 'delete', path: '/pets/{id}' } }),
				note('pets/list-pets', { operation: { protocol: 'rest', method: 'get', path: '/pets' } }),
				note('pets/get-pet', { operation: { protocol: 'rest', method: 'get', path: '/pets/{id}' } }),
				note('pets/pet', { model: { name: 'Pet', schema: { type: 'object' } } })
			],
			[
				{ slug: 'guides', title: 'Guides', href: '/folders/guides/' },
				{ slug: 'pets', title: 'Pets', href: '/folders/pets/' }
			]
		);
		expect(nav.map((section) => [section.title, section.entries.map((entry) => entry.slug.split('/')[1])])).toEqual([
			['Guides', ['authentication']],
			['Pets', ['pet', 'list-pets', 'get-pet', 'delete-pet']]
		]);
	});

	it("names a section after its folder's index note and leaves that note out of the list", () => {
		const nav = apiNav(
			[
				{ ...note('graphql'), title: 'GraphQL' },
				note('graphql/pet', { operation: { protocol: 'graphql', kind: 'query', name: 'pet' } })
			],
			[{ slug: 'graphql', title: 'Graphql', href: '/folders/graphql/' }]
		);
		expect(nav.map((section) => [section.slug, section.title, section.entries.length])).toEqual([['graphql', 'GraphQL', 1]]);
	});
});

describe('requestSnippets', () => {
	it('fills path parameters and writes curl, JavaScript, and Python', () => {
		const operation = readOperation({
			operation: {
				protocol: 'rest',
				method: 'post',
				path: '/pets/{petId}/photos',
				auth: 'bearer',
				parameters: [
					{ name: 'petId', in: 'path', type: 'string', required: true, example: 'p_42' },
					{ name: 'size', in: 'query', type: 'string', example: 'large' }
				],
				requestBody: { example: { url: 'https://example.com/biscuit.jpg' } }
			}
		});
		if (operation?.protocol !== 'rest') throw new Error('expected a REST operation');
		const snippets = requestSnippets(operation, 'https://api.example.com', {});
		expect(snippets.curl).toContain("curl -X POST 'https://api.example.com/pets/p_42/photos?size=large'");
		expect(snippets.curl).toContain("-H 'Authorization: Bearer $TOKEN'");
		expect(snippets.javascript).toContain("method: 'POST'");
		expect(snippets.python).toContain('requests.post(');
	});
});
