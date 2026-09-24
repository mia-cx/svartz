import { isRecord } from '@svartz/ui';

type Properties = Readonly<Record<string, unknown>>;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const scalarText = (value: unknown) =>
	typeof value === 'number' || typeof value === 'boolean' ? String(value) : text(value);
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);

// --- Schemas ---------------------------------------------------------------

/**
 * The JSON Schema subset the theme renders. `$ref` names another note's model
 * (`$ref: Pet`), so an OpenAPI plugin maps `#/components/schemas/Pet` to `Pet`.
 */
export interface SchemaNode {
	readonly type?: string;
	readonly format?: string;
	readonly description?: string;
	readonly enum?: readonly string[];
	readonly example?: unknown;
	readonly nullable?: boolean;
	readonly ref?: string;
	readonly items?: SchemaNode;
	readonly properties?: readonly SchemaProperty[];
	readonly oneOf?: readonly SchemaNode[];
	readonly anyOf?: readonly SchemaNode[];
}

export interface SchemaProperty {
	readonly name: string;
	readonly required: boolean;
	readonly schema: SchemaNode;
}

export function readSchema(raw: unknown): SchemaNode | undefined {
	if (!isRecord(raw)) return undefined;
	const ref = text(raw.$ref)?.split('/').at(-1);
	const required = Array.isArray(raw.required) ? raw.required.filter((name) => typeof name === 'string') : [];
	const properties = isRecord(raw.properties)
		? Object.entries(raw.properties).flatMap(([name, value]): SchemaProperty[] => {
				const schema = readSchema(value);
				return schema ? [{ name, required: required.includes(name), schema }] : [];
			})
		: undefined;
	const variants = (value: unknown) =>
		Array.isArray(value) ? value.map(readSchema).filter((node) => node !== undefined) : undefined;
	return {
		type: text(raw.type),
		format: text(raw.format),
		description: text(raw.description),
		enum: Array.isArray(raw.enum) ? raw.enum.map(scalarText).filter((item) => item !== undefined) : undefined,
		example: raw.example,
		nullable: raw.nullable === true,
		ref,
		items: readSchema(raw.items),
		properties,
		oneOf: variants(raw.oneOf),
		anyOf: variants(raw.anyOf)
	};
}

/** How a schema reads in one line: `string (uuid)`, `Pet[]`, `"a" | "b"`. */
export function schemaLabel(schema: SchemaNode): string {
	if (schema.ref) return schema.ref;
	if (schema.enum?.length) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
	if (schema.type === 'array') return `${schema.items ? schemaLabel(schema.items) : 'unknown'}[]`;
	const variants = schema.oneOf ?? schema.anyOf;
	if (variants?.length) return variants.map(schemaLabel).join(' | ');
	const base = schema.type ?? (schema.properties ? 'object' : 'any');
	return `${base}${schema.format ? ` (${schema.format})` : ''}${schema.nullable ? ' | null' : ''}`;
}

const FORMAT_EXAMPLES: Record<string, string> = {
	uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
	email: 'user@example.com',
	'date-time': '2026-09-24T12:00:00Z',
	date: '2026-09-24',
	uri: 'https://example.com',
	url: 'https://example.com'
};

/** A representative value for a schema: its example, then its first enum value, then a placeholder by type. */
export function exampleFromSchema(
	schema: SchemaNode,
	models: Readonly<Record<string, SchemaNode>>,
	seen: ReadonlySet<string> = new Set()
): unknown {
	if (schema.example !== undefined) return schema.example;
	if (schema.ref) {
		const model = models[schema.ref];
		return model && !seen.has(schema.ref) ? exampleFromSchema(model, models, new Set([...seen, schema.ref])) : {};
	}
	if (schema.enum?.length) return schema.enum[0];
	const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
	if (variant) return exampleFromSchema(variant, models, seen);
	switch (schema.type) {
		case 'array':
			return schema.items ? [exampleFromSchema(schema.items, models, seen)] : [];
		case 'integer':
		case 'number':
			return 0;
		case 'boolean':
			return true;
		case 'string':
			return (schema.format && FORMAT_EXAMPLES[schema.format]) ?? 'string';
		default:
			return Object.fromEntries(
				(schema.properties ?? []).map((property) => [property.name, exampleFromSchema(property.schema, models, seen)])
			);
	}
}

// --- Operations ------------------------------------------------------------

export const HTTP_METHODS = {
	GET: 'green',
	POST: 'blue',
	PUT: 'amber',
	PATCH: 'violet',
	DELETE: 'red',
	HEAD: 'cyan',
	OPTIONS: 'cyan'
} as const;

export type HttpMethod = keyof typeof HTTP_METHODS;
export const GRAPHQL_KINDS = { query: 'green', mutation: 'blue', subscription: 'violet' } as const;
export type GraphqlKind = keyof typeof GRAPHQL_KINDS;

export interface ApiParameter {
	readonly name: string;
	readonly in: 'path' | 'query' | 'header' | 'cookie';
	readonly type?: string;
	readonly required: boolean;
	readonly description?: string;
	readonly example?: string;
}

export interface ApiResponse {
	readonly status: string;
	readonly description?: string;
	readonly schema?: SchemaNode;
	readonly example?: unknown;
}

export interface RestOperation {
	readonly protocol: 'rest';
	readonly method: HttpMethod;
	readonly path: string;
	readonly auth?: string;
	readonly parameters: readonly ApiParameter[];
	readonly requestBody?: { readonly contentType: string; readonly schema?: SchemaNode; readonly example?: unknown };
	readonly responses: readonly ApiResponse[];
}

export interface GraphqlArgument {
	readonly name: string;
	readonly type: string;
	readonly required: boolean;
	readonly description?: string;
}

export interface GraphqlOperation {
	readonly protocol: 'graphql';
	readonly kind: GraphqlKind;
	readonly name: string;
	readonly args: readonly GraphqlArgument[];
	readonly returns?: string;
	readonly example?: { readonly query?: string; readonly variables?: unknown; readonly response?: unknown };
}

/**
 * The `operation` frontmatter schema, one endpoint or GraphQL field per note.
 * An OpenAPI or GraphQL SDL plugin emits this shape.
 *
 * ```yaml
 * operation:
 *   protocol: rest
 *   method: POST
 *   path: /pets/{petId}/photos
 *   auth: bearer
 *   parameters: [{ name: petId, in: path, type: string, required: true, example: p_42 }]
 *   requestBody: { schema: { $ref: NewPhoto } }
 *   responses:
 *     201: { description: Created, schema: { $ref: Photo } }
 * ```
 */
export type ApiOperation = RestOperation | GraphqlOperation;

const LOCATIONS = ['path', 'query', 'header', 'cookie'] as const;

function readResponses(raw: unknown): ApiResponse[] {
	const entries = Array.isArray(raw)
		? records(raw).map((response) => [scalarText(response.status), response] as const)
		: isRecord(raw)
			? Object.entries(raw).map(([status, value]) => [status, isRecord(value) ? value : {}] as const)
			: [];
	return entries
		.filter((entry): entry is readonly [string, Properties] => entry[0] !== undefined)
		.map(([status, response]) => ({
			status,
			description: text(response.description),
			schema: readSchema(response.schema),
			example: response.example
		}))
		.sort((left, right) => left.status.localeCompare(right.status));
}

export function readOperation(properties: Properties): ApiOperation | undefined {
	const raw = properties.operation;
	if (!isRecord(raw)) return undefined;
	if (raw.protocol === 'graphql') {
		const kind = text(raw.kind) as GraphqlKind | undefined;
		const name = text(raw.name);
		if (!kind || !(kind in GRAPHQL_KINDS) || !name) return undefined;
		const example = isRecord(raw.example) ? raw.example : undefined;
		return {
			protocol: 'graphql',
			kind,
			name,
			args: records(raw.args).flatMap((arg): GraphqlArgument[] => {
				const argName = text(arg.name);
				const type = text(arg.type);
				return argName && type ? [{ name: argName, type, required: arg.required === true, description: text(arg.description) }] : [];
			}),
			returns: text(raw.returns),
			example: example && { query: text(example.query), variables: example.variables, response: example.response }
		};
	}
	const method = text(raw.method)?.toUpperCase();
	const path = text(raw.path);
	if (!method || !(method in HTTP_METHODS) || !path) return undefined;
	const body = isRecord(raw.requestBody) ? raw.requestBody : undefined;
	return {
		protocol: 'rest',
		method: method as HttpMethod,
		path,
		auth: text(raw.auth),
		parameters: records(raw.parameters).flatMap((parameter): ApiParameter[] => {
			const name = text(parameter.name);
			const location = LOCATIONS.find((candidate) => candidate === parameter.in) ?? 'query';
			return name
				? [{
						name,
						in: location,
						type: text(parameter.type),
						required: location === 'path' || parameter.required === true,
						description: text(parameter.description),
						example: scalarText(parameter.example)
					}]
				: [];
		}),
		requestBody: body && {
			contentType: text(body.contentType) ?? 'application/json',
			schema: readSchema(body.schema),
			example: body.example
		},
		responses: readResponses(raw.responses)
	};
}

/** A model note: `model: { name: Pet, schema: {…} }`. */
export function readModel(properties: Properties): { name: string; schema: SchemaNode } | undefined {
	const raw = properties.model;
	if (!isRecord(raw)) return undefined;
	const name = text(raw.name);
	const schema = readSchema(raw.schema);
	return name && schema ? { name, schema } : undefined;
}

// --- Navigation --------------------------------------------------------------

interface NavEntry {
	readonly slug: string;
	readonly title: string;
	readonly href: string;
	readonly properties: Properties;
}

export interface ApiNavSection<T> {
	/** The top-level folder, or `""` for loose notes. */
	readonly slug: string;
	readonly title: string;
	readonly href?: string;
	/** A resource (models and operations) rather than a folder of guides. */
	readonly reference: boolean;
	readonly entries: T[];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const METHOD_ORDER = Object.keys(HTTP_METHODS);

/** Sort key: models, then operations by path and method, then guides by title. */
function navRank(entry: NavEntry): [number, string, number] {
	if (readModel(entry.properties)) return [0, entry.title, 0];
	const operation = readOperation(entry.properties);
	if (operation?.protocol === 'rest') return [1, operation.path, METHOD_ORDER.indexOf(operation.method)];
	if (operation) return [1, operation.name, Object.keys(GRAPHQL_KINDS).indexOf(operation.kind)];
	return [2, entry.title, 0];
}

/**
 * The sidebar: one section per top-level folder, guides before resources.
 * A folder note (`graphql/index.md`, slugged `graphql`) names its section:
 * `GraphQL`, not the slug's `Graphql`.
 */
export function apiNav<T extends NavEntry>(
	entries: readonly T[],
	folders: readonly { readonly slug: string; readonly title: string; readonly href: string }[]
): ApiNavSection<T>[] {
	const sections = new Map<string, T[]>();
	const folderNotes = new Map<string, string>();
	for (const entry of entries) {
		if (entry.slug === 'index') continue;
		if (!entry.slug.includes('/') && folders.some((folder) => folder.slug === entry.slug)) {
			folderNotes.set(entry.slug, entry.title);
			continue;
		}
		const key = entry.slug.includes('/') ? entry.slug.split('/')[0]! : '';
		sections.set(key, [...(sections.get(key) ?? []), entry]);
	}
	const compare = (left: T, right: T) => {
		const [leftGroup, leftKey, leftOrder] = navRank(left);
		const [rightGroup, rightKey, rightOrder] = navRank(right);
		return leftGroup - rightGroup || collator.compare(leftKey, rightKey) || leftOrder - rightOrder;
	};
	return [...sections]
		.map(([key, grouped]): ApiNavSection<T> => {
			const folder = folders.find((candidate) => candidate.slug === key);
			return {
				slug: key,
				title: key ? (folderNotes.get(key) ?? folder?.title ?? key) : 'Overview',
				href: folder?.href,
				reference: grouped.some((entry) => navRank(entry)[0] < 2),
				entries: [...grouped].sort(compare)
			};
		})
		.sort((left, right) => Number(left.reference) - Number(right.reference) || collator.compare(left.title, right.title));
}

/** Every model schema in the vault, by name, for `$ref` resolution and example generation. */
export function modelSchemas(entries: readonly NavEntry[]): Record<string, SchemaNode> {
	return Object.fromEntries(
		entries.flatMap((entry) => {
			const model = readModel(entry.properties);
			return model ? [[model.name, model.schema]] : [];
		})
	);
}

// --- Examples ----------------------------------------------------------------

export type SnippetLanguage = 'curl' | 'javascript' | 'python';
export const SNIPPET_LANGUAGES: readonly { readonly id: SnippetLanguage; readonly label: string }[] = [
	{ id: 'curl', label: 'cURL' },
	{ id: 'javascript', label: 'JavaScript' },
	{ id: 'python', label: 'Python' }
];

/** A request example body: the operation's example, else one generated from its schema. */
export function requestBodyExample(operation: RestOperation, models: Readonly<Record<string, SchemaNode>>): unknown {
	const body = operation.requestBody;
	if (!body) return undefined;
	return body.example ?? (body.schema ? exampleFromSchema(body.schema, models) : undefined);
}

/** Copyable requests for a REST operation, with example values in the URL and body. */
export function requestSnippets(
	operation: RestOperation,
	baseUrl: string,
	models: Readonly<Record<string, SchemaNode>>
): Record<SnippetLanguage, string> {
	const valueOf = (parameter: ApiParameter) => parameter.example ?? `{${parameter.name}}`;
	const path = operation.parameters
		.filter((parameter) => parameter.in === 'path')
		.reduce((current, parameter) => current.replace(`{${parameter.name}}`, encodeURIComponent(valueOf(parameter))), operation.path);
	const query = operation.parameters
		.filter((parameter) => parameter.in === 'query' && (parameter.required || parameter.example))
		.map((parameter) => `${encodeURIComponent(parameter.name)}=${encodeURIComponent(valueOf(parameter))}`)
		.join('&');
	const url = `${baseUrl.replace(/\/$/, '')}${path}${query ? `?${query}` : ''}`;
	const headers: [string, string][] = [
		...(operation.auth && operation.auth !== 'none' ? [['Authorization', operation.auth === 'basic' ? 'Basic $CREDENTIALS' : 'Bearer $TOKEN'] as [string, string]] : []),
		...operation.parameters.filter((parameter) => parameter.in === 'header').map((parameter): [string, string] => [parameter.name, valueOf(parameter)])
	];
	const body = requestBodyExample(operation, models);
	if (body !== undefined) headers.push(['Content-Type', operation.requestBody!.contentType]);
	const json = body === undefined ? undefined : JSON.stringify(body, null, 2);
	const method = operation.method;

	const curl = [
		`curl -X ${method} '${url}'`,
		...headers.map(([name, value]) => `  -H '${name}: ${value}'`),
		...(json ? [`  -d '${json.replace(/\n/g, '\n  ')}'`] : [])
	].join(' \\\n');

	const jsHeaders = headers.map(([name, value]) => `    '${name}': ${value.includes('$') ? `\`${value.replace('$', '${')}}\`` : `'${value}'`}`);
	const javascript = [
		`const response = await fetch('${url}', {`,
		`  method: '${method}',`,
		...(jsHeaders.length ? ['  headers: {', jsHeaders.join(',\n'), '  },'] : []),
		...(json ? [`  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),`] : []),
		'});',
		'const data = await response.json();'
	].join('\n');

	const pyHeaders = headers.map(([name, value]) => `    "${name}": ${value.includes('$') ? `f"${value.replace(/\$(\w+)/, '{$1}')}"` : `"${value}"`}`);
	const python = [
		'import requests',
		'',
		`response = requests.${method.toLowerCase()}(`,
		`    "${url}",`,
		...(pyHeaders.length ? ['    headers={', pyHeaders.map((line) => `    ${line}`).join(',\n'), '    },'] : []),
		...(json ? [`    json=${json.replace(/\n/g, '\n    ').replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')},`] : []),
		')',
		'data = response.json()'
	].join('\n');

	return { curl, javascript, python };
}
