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
	/** `null` only for a schema that allows nothing else. */
	readonly type?: string;
	/** Names an alternative in a union. */
	readonly title?: string;
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
	/** OpenAPI's `discriminator.propertyName`. */
	readonly discriminator?: string;
	/** Length and range limits in words: `at most 100 characters`. */
	readonly constraints?: readonly string[];
	/** The regular expression a string matches. */
	readonly pattern?: string;
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
	return RANGES.flatMap(([minKey, maxKey, unit]) => {
		const [min, max] = [count(raw[minKey]), count(raw[maxKey])];
		const noun = (n: number) => (unit ? ` ${unit}${n === 1 ? '' : 's'}` : '');
		if (min !== undefined && max !== undefined) return [`${min}–${max}${noun(max)}`];
		if (max !== undefined) return [`at most ${max}${noun(max)}`];
		if (min !== undefined && !(unit && min === 0)) return [`at least ${min}${noun(min)}`];
		return [];
	});
}

const isNullType = (node: SchemaNode) => node.type === 'null';

/** Keywords that describe the whole schema rather than one of its types. */
const SHARED_KEYWORDS = { title: undefined, description: undefined, default: undefined, example: undefined, examples: undefined, nullable: undefined };

/**
 * A frontmatter schema, normalized. `null` never stands alone in a union: a
 * `null` type or alternative marks the schema `nullable`, and a union left
 * with one alternative becomes that alternative. `type: [string, number]`
 * reads as `anyOf` its types.
 */
export function readSchema(raw: unknown): SchemaNode | undefined {
	if (!isRecord(raw)) return undefined;
	const types = (Array.isArray(raw.type) ? raw.type : [raw.type]).filter((type): type is string => typeof type === 'string');
	const nonNull = types.filter((type) => type !== 'null');
	const alternatives = (value: unknown) => (Array.isArray(value) ? value.map(readSchema).filter((node) => node !== undefined) : []);
	const [oneOf, anyOf] = [alternatives(raw.oneOf), alternatives(raw.anyOf)];
	const shared = {
		title: text(raw.title),
		description: text(raw.description),
		default: raw.default,
		// `example: null` is a real example, so only a missing one falls back.
		example: raw.example !== undefined ? raw.example : Array.isArray(raw.examples) ? raw.examples[0] : undefined,
		nullable: raw.nullable === true || (nonNull.length > 0 && nonNull.length < types.length) || [...oneOf, ...anyOf].some(isNullType) || undefined
	};
	if (nonNull.length > 1) {
		return { ...shared, anyOf: nonNull.map((type) => readSchema({ ...raw, ...SHARED_KEYWORDS, type })!) };
	}
	const [someOf, someAny] = [oneOf.filter((node) => !isNullType(node)), anyOf.filter((node) => !isNullType(node))];
	const required = Array.isArray(raw.required) ? raw.required.filter((name) => typeof name === 'string') : [];
	const properties = isRecord(raw.properties)
		? Object.entries(raw.properties).flatMap(([name, value]): SchemaProperty[] => {
				const schema = readSchema(value);
				return schema ? [{ name, required: required.includes(name), schema }] : [];
			})
		: undefined;
	const values = isScalar(raw.const) ? [raw.const] : Array.isArray(raw.enum) ? raw.enum.filter(isScalar) : undefined;
	const node: SchemaNode = {
		...shared,
		type: nonNull[0] ?? (types.length ? 'null' : undefined),
		format: text(raw.format),
		enum: values,
		ref: text(raw.$ref)?.split('/').at(-1),
		items: readSchema(raw.items),
		properties,
		values: readSchema(raw.additionalProperties),
		oneOf: someOf.length ? someOf : undefined,
		anyOf: someAny.length ? someAny : undefined,
		discriminator: isRecord(raw.discriminator) ? text(raw.discriminator.propertyName) : undefined,
		constraints: constraintsOf(raw),
		pattern: text(raw.pattern)
	};
	// A union left with one alternative is that alternative. Keywords written beside the union fill
	// what the alternative leaves out, and the union's title, description, default, and example win.
	const [lone, ...others] = [...someOf, ...someAny];
	if (!lone || others.length > 0 || node.properties || node.ref) return node;
	const beside = defined({ ...node, oneOf: undefined, anyOf: undefined, constraints: undefined, nullable: undefined });
	return {
		...beside,
		...defined(lone),
		...defined({ ...shared, nullable: undefined }),
		nullable: lone.nullable || node.nullable,
		constraints: [...new Set([...(lone.constraints ?? []), ...(node.constraints ?? [])])]
	};
}

/** The entries of `record` that have a value. */
const defined = <T extends object>(record: T): Partial<T> =>
	Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;

/** A union's alternatives: its `oneOf`, else its `anyOf`. */
export const alternativesOf = (schema: SchemaNode) => schema.oneOf ?? schema.anyOf;

/**
 * The property that tells a union's object alternatives apart: OpenAPI's
 * `discriminator`, else the one property every alternative pins to a
 * different single value (`kind: { const: webhook }`).
 */
export function discriminatorOf(schema: SchemaNode): string | undefined {
	if (schema.discriminator) return schema.discriminator;
	const alternatives = alternativesOf(schema);
	if (!alternatives || alternatives.length < 2) return undefined;
	const pinned = (node: SchemaNode, name: string) => {
		const values = node.properties?.find((property) => property.name === name)?.schema.enum;
		return values?.length === 1 ? JSON.stringify(values[0]) : undefined;
	};
	return alternatives[0].properties?.map(({ name }) => name).find((name) => {
		const values = alternatives.map((node) => pinned(node, name));
		return values.every((value) => value !== undefined) && new Set(values).size === values.length;
	});
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
	if (schema.type === 'array') {
		const item = schema.items ? schemaLabel(schema.items) : 'unknown';
		return `${item.includes(' | ') ? `(${item})` : item}[]${nullable}`;
	}
	// Alternatives that read alike list once: two object shapes read `object`.
	const variants = alternativesOf(schema);
	if (variants?.length) return [...new Set(variants.map(schemaLabel))].join(' | ') + nullable;
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
		case 'null':
			return null;
		case 'string':
			return (schema.format && FORMAT_EXAMPLES[schema.format]) ?? 'string';
		default:
			return Object.fromEntries(
				(schema.properties ?? []).map((property) => [property.name, exampleFromSchema(property.schema, schemas, seen)])
			);
	}
}
