import { isRecord } from '../theme-settings.js';

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const isScalar = (value: unknown): value is string | number | boolean =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * The JSON Schema subset reference pages render. `$ref` names a schema page
 * (`$ref: Pet`); `#/components/schemas/Pet` and `#/$defs/Pet` also name `Pet`.
 */
export interface SchemaNode {
	readonly type?: string;
	readonly format?: string;
	readonly description?: string;
	/** Values keep their JSON type: `enum: [0, 1]` stays numeric. */
	readonly enum?: readonly (string | number | boolean)[];
	readonly default?: unknown;
	readonly example?: unknown;
	/** From `nullable: true` or a `type: [string, "null"]` union. */
	readonly nullable?: boolean;
	readonly ref?: string;
	readonly items?: SchemaNode;
	readonly properties?: readonly SchemaProperty[];
	/** The value schema of a map: `additionalProperties: { type: string }`. */
	readonly values?: SchemaNode;
	readonly oneOf?: readonly SchemaNode[];
	readonly anyOf?: readonly SchemaNode[];
	/** Length, range, and pattern limits in words: `at most 100 characters`. */
	readonly constraints?: readonly string[];
}

export interface SchemaProperty {
	readonly name: string;
	readonly required: boolean;
	readonly schema: SchemaNode;
}

const RANGES = [
	['minLength', 'maxLength', 'character'],
	['minItems', 'maxItems', 'item'],
	['minimum', 'maximum', '']
] as const;

/** `1–64 characters`, `at most 100 characters`, `at least 0`. */
function constraintsOf(raw: Readonly<Record<string, unknown>>): string[] {
	const found = RANGES.flatMap(([minKey, maxKey, unit]) => {
		const [min, max] = [count(raw[minKey]), count(raw[maxKey])];
		const noun = (n: number) => (unit ? ` ${unit}${n === 1 ? '' : 's'}` : '');
		if (min !== undefined && max !== undefined) return [`${min}–${max}${noun(max)}`];
		if (max !== undefined) return [`at most ${max}${noun(max)}`];
		if (min !== undefined && !(unit && min === 0)) return [`at least ${min}${noun(min)}`];
		return [];
	});
	const pattern = text(raw.pattern);
	return pattern ? [...found, `matches \`${pattern}\``] : found;
}

export function readSchema(raw: unknown): SchemaNode | undefined {
	if (!isRecord(raw)) return undefined;
	const ref = text(raw.$ref)?.split('/').at(-1);
	const types = (Array.isArray(raw.type) ? raw.type : [raw.type]).filter((type): type is string => typeof type === 'string');
	const required = Array.isArray(raw.required) ? raw.required.filter((name) => typeof name === 'string') : [];
	const properties = isRecord(raw.properties)
		? Object.entries(raw.properties).flatMap(([name, value]): SchemaProperty[] => {
				const schema = readSchema(value);
				return schema ? [{ name, required: required.includes(name), schema }] : [];
			})
		: undefined;
	const variants = (value: unknown) =>
		Array.isArray(value) ? value.map(readSchema).filter((node) => node !== undefined) : undefined;
	const values = isScalar(raw.const) ? [raw.const] : Array.isArray(raw.enum) ? raw.enum.filter(isScalar) : undefined;
	return {
		type: types.find((type) => type !== 'null'),
		format: text(raw.format),
		description: text(raw.description),
		enum: values,
		default: raw.default,
		example: raw.example ?? (Array.isArray(raw.examples) ? raw.examples[0] : undefined),
		nullable: raw.nullable === true || types.includes('null'),
		ref,
		items: readSchema(raw.items),
		properties,
		values: readSchema(raw.additionalProperties),
		oneOf: variants(raw.oneOf),
		anyOf: variants(raw.anyOf),
		constraints: constraintsOf(raw)
	};
}

/** A schema page: `model: { name: Pet, schema: {…} }`. */
export function readModel(properties: Readonly<Record<string, unknown>>): { name: string; schema: SchemaNode } | undefined {
	const raw = properties.model;
	if (!isRecord(raw)) return undefined;
	const name = text(raw.name);
	const schema = readSchema(raw.schema);
	return name && schema ? { name, schema } : undefined;
}

/** How a schema reads in one line: `string (uuid)`, `Pet[]`, `"a" | "b"`, `map of string`. */
export function schemaLabel(schema: SchemaNode): string {
	const nullable = schema.nullable ? ' | null' : '';
	if (schema.ref) return `${schema.ref}${nullable}`;
	if (schema.enum?.length) return schema.enum.map((value) => JSON.stringify(value)).join(' | ') + nullable;
	if (schema.type === 'array') return `${schema.items ? schemaLabel(schema.items) : 'unknown'}[]${nullable}`;
	const variants = schema.oneOf ?? schema.anyOf;
	if (variants?.length) return variants.map(schemaLabel).join(' | ') + nullable;
	if (schema.values && !schema.properties) return `map of ${schemaLabel(schema.values)}${nullable}`;
	const base = schema.type ?? (schema.properties ? 'object' : 'any');
	return `${base}${schema.format ? ` (${schema.format})` : ''}${nullable}`;
}

const FORMAT_EXAMPLES: Record<string, string> = {
	uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
	email: 'user@example.com',
	'date-time': '2026-09-24T12:00:00Z',
	date: '2026-09-24',
	uri: 'https://example.com',
	url: 'https://example.com'
};

/** A representative value: the schema's example, then its default, its first enum value, then a placeholder by type. */
export function exampleFromSchema(
	schema: SchemaNode,
	schemas: Readonly<Record<string, SchemaNode>>,
	seen: ReadonlySet<string> = new Set()
): unknown {
	if (schema.example !== undefined) return schema.example;
	if (schema.default !== undefined) return schema.default;
	if (schema.ref) {
		const target = schemas[schema.ref];
		return target && !seen.has(schema.ref) ? exampleFromSchema(target, schemas, new Set([...seen, schema.ref])) : {};
	}
	if (schema.enum?.length) return schema.enum[0];
	const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
	if (variant) return exampleFromSchema(variant, schemas, seen);
	switch (schema.type) {
		case 'array':
			return schema.items ? [exampleFromSchema(schema.items, schemas, seen)] : [];
		case 'integer':
		case 'number':
			return 0;
		case 'boolean':
			return true;
		case 'string':
			return (schema.format && FORMAT_EXAMPLES[schema.format]) ?? 'string';
		default:
			return Object.fromEntries(
				(schema.properties ?? []).map((property) => [property.name, exampleFromSchema(property.schema, schemas, seen)])
			);
	}
}
