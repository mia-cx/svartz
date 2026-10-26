import { describe, expect, it } from 'vitest';
import { exampleFromSchema, readSchema, schemaLabel } from './schema.js';

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

	it.each([
		['numeric enums stay numeric', { type: 'integer', enum: [0, 1] }, '0 | 1'],
		['a type list with null is nullable', { type: ['string', 'null'] }, 'string | null'],
		['additionalProperties is a map', { type: 'object', additionalProperties: { type: 'string' } }, 'map of string'],
		['a $defs ref names its schema', { $ref: '#/$defs/Pet' }, 'Pet'],
		['const is a one-value enum', { const: 'tools/call' }, '"tools/call"']
	])('labels JSON Schema as written by tools: %s', (_, raw, label) => {
		expect(schemaLabel(readSchema(raw)!)).toBe(label);
	});

	it('describes length, range, and pattern limits in words', () => {
		expect(readSchema({ type: 'string', maxLength: 100 })?.constraints).toEqual(['at most 100 characters']);
		expect(readSchema({ type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z]+$' })?.constraints).toEqual([
			'1–64 characters',
			'matches `^[a-z]+$`'
		]);
		expect(readSchema({ type: 'integer', minimum: 0 })?.constraints).toEqual(['at least 0']);
	});
});

describe('exampleFromSchema', () => {
	it('builds a representative value from examples, defaults, enums, and refs', () => {
		const schemas = { Owner: readSchema({ type: 'object', properties: { email: { type: 'string', format: 'email' } } })! };
		const raw = { ...petSchema, properties: { ...petSchema.properties, limit: { type: 'integer', default: 20 } } };
		expect(exampleFromSchema(readSchema(raw)!, schemas)).toEqual({
			id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
			name: 'Biscuit',
			status: 'available',
			tags: ['string'],
			owner: { email: 'user@example.com' },
			limit: 20
		});
	});

	it('stops at recursive refs', () => {
		const schemas = { Node: readSchema({ type: 'object', properties: { next: { $ref: 'Node' } } })! };
		expect(exampleFromSchema(readSchema({ $ref: 'Node' })!, schemas)).toEqual({ next: {} });
	});
});
