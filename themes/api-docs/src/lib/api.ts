import { isRecord } from '@svartz/ui';
import {
	exampleFromSchema,
	readAuth,
	readSchema,
	type ReferenceAuth,
	type ReferenceBadge,
	type ReferenceHue,
	type SchemaNode
} from '@svartz/ui/reference';

type Properties = Readonly<Record<string, unknown>>;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const scalarText = (value: unknown) =>
	typeof value === 'number' || typeof value === 'boolean' ? String(value) : text(value);
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);

export { exampleFromSchema, readModel, readSchema, schemaLabel, type SchemaNode, type SchemaProperty } from '@svartz/ui/reference';

// --- Operations ------------------------------------------------------------

/** Each method's badge hue, after Swagger UI's: GET blue, POST green, DELETE red. */
export const HTTP_METHODS = {
	GET: 'blue',
	POST: 'green',
	PUT: 'orange',
	PATCH: 'teal',
	DELETE: 'red',
	HEAD: 'violet',
	OPTIONS: 'cyan'
} as const satisfies Record<string, ReferenceHue>;

export type HttpMethod = keyof typeof HTTP_METHODS;
export const GRAPHQL_KINDS = { query: 'green', mutation: 'blue', subscription: 'violet' } as const satisfies Record<string, ReferenceHue>;
export type GraphqlKind = keyof typeof GRAPHQL_KINDS;

/** Sidebar badges fit eight characters, so `subscription` shortens there. */
const GRAPHQL_NAV_LABELS: Record<GraphqlKind, string> = { query: 'QUERY', mutation: 'MUTATION', subscription: 'SUB' };

export const methodBadge = (method: HttpMethod): ReferenceBadge => ({ label: method, hue: HTTP_METHODS[method] });
export const graphqlBadge = (kind: GraphqlKind, nav = false): ReferenceBadge => ({
	label: nav ? GRAPHQL_NAV_LABELS[kind] : kind.toUpperCase(),
	hue: GRAPHQL_KINDS[kind]
});

export interface ApiParameter {
	readonly name: string;
	readonly in: 'path' | 'query' | 'header' | 'cookie';
	readonly type?: string;
	readonly required: boolean;
	readonly description?: string;
	readonly example?: string;
	/** The parameter's value schema: its `schema`, else one built from `type`, `enum`, and `default`. */
	readonly schema: SchemaNode;
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
	readonly auth?: ReferenceAuth;
	readonly parameters: readonly ApiParameter[];
	readonly requestBody?: { readonly contentType: string; readonly schema?: SchemaNode; readonly example?: unknown };
	readonly responses: readonly ApiResponse[];
}

export interface GraphqlArgument {
	readonly name: string;
	readonly type: string;
	readonly required: boolean;
	readonly description?: string;
	readonly default?: unknown;
}

export interface GraphqlOperation {
	readonly protocol: 'graphql';
	readonly kind: GraphqlKind;
	readonly name: string;
	readonly auth?: ReferenceAuth;
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

function readParameter(parameter: Properties): ApiParameter[] {
	const name = text(parameter.name);
	if (!name) return [];
	const location = LOCATIONS.find((candidate) => candidate === parameter.in) ?? 'query';
	const type = text(parameter.type);
	const description = text(parameter.description);
	const schema = readSchema(
		isRecord(parameter.schema) ? parameter.schema : { type, enum: parameter.enum, default: parameter.default, example: parameter.example }
	)!;
	return [{
		name,
		in: location,
		type: type ?? schema.type,
		required: location === 'path' || parameter.required === true,
		description,
		example: scalarText(parameter.example ?? schema.example),
		schema: { ...schema, description: description ?? schema.description }
	}];
}

/** A REST or GraphQL operation from a page's `operation` metadata, or `undefined` when it isn't one. */
export function readOperation(properties: Properties): ApiOperation | undefined {
	const raw = properties.operation;
	if (!isRecord(raw)) return undefined;
	if (raw.protocol === 'graphql') return readGraphql(raw);
	if (raw.protocol !== undefined && raw.protocol !== 'rest') return undefined;
	const method = text(raw.method)?.toUpperCase();
	const path = text(raw.path);
	if (!method || !(method in HTTP_METHODS) || !path) return undefined;
	const body = isRecord(raw.requestBody) ? raw.requestBody : undefined;
	return {
		protocol: 'rest',
		method: method as HttpMethod,
		path,
		auth: readAuth(raw.auth),
		parameters: records(raw.parameters).flatMap(readParameter),
		requestBody: body && {
			contentType: text(body.contentType) ?? 'application/json',
			schema: readSchema(body.schema),
			example: body.example
		},
		responses: readResponses(raw.responses)
	};
}

function readGraphql(raw: Properties): GraphqlOperation | undefined {
	const kind = text(raw.kind) as GraphqlKind | undefined;
	const name = text(raw.name);
	if (!kind || !(kind in GRAPHQL_KINDS) || !name) return undefined;
	const example = isRecord(raw.example) ? raw.example : undefined;
	return {
		protocol: 'graphql',
		kind,
		name,
		auth: readAuth(raw.auth),
		args: records(raw.args).flatMap((arg): GraphqlArgument[] => {
			const argName = text(arg.name);
			const type = text(arg.type);
			return argName && type
				? [{ name: argName, type, required: arg.required === true || type.endsWith('!'), description: text(arg.description), default: arg.default }]
				: [];
		}),
		returns: text(raw.returns),
		example: example && { query: text(example.query), variables: example.variables, response: example.response }
	};
}

/** The schema a field list renders for parameters or arguments. */
export const fieldsSchema = (fields: readonly { name: string; required: boolean; schema: SchemaNode }[]): SchemaNode => ({
	type: 'object',
	properties: fields.map(({ name, required, schema }) => ({ name, required, schema }))
});

/** A GraphQL argument as a schema field: its GraphQL type reads as written (`ID!`). */
export const argumentSchema = (arg: GraphqlArgument): SchemaNode => ({ type: arg.type, description: arg.description, default: arg.default });

/** A GraphQL type's named type, without list and non-null marks: `[Pet!]!` → `Pet`. */
export const namedType = (type: string) => type.replace(/\[\[|\]\]/g, '').replace(/[[\]!]/g, '');

// --- Examples ----------------------------------------------------------------

export type SnippetLanguage = 'curl' | 'javascript' | 'python';

/** A request header; `variable` names the credential the reader supplies (`$TOKEN`). */
interface SnippetHeader {
	readonly name: string;
	readonly value: string;
	readonly variable?: string;
}
export const SNIPPET_LANGUAGES: readonly { readonly id: SnippetLanguage; readonly label: string }[] = [
	{ id: 'curl', label: 'cURL' },
	{ id: 'javascript', label: 'JavaScript' },
	{ id: 'python', label: 'Python' }
];

const PYTHON_KEYWORDS: Readonly<Record<string, string>> = { true: 'True', false: 'False', null: 'None' };

/** JSON as a Python literal. String tokens match first, so `"true story"` keeps its text. */
const pythonLiteral = (json: string) =>
	json.replace(/"(?:[^"\\]|\\.)*"|\b(?:true|false|null)\b/g, (token) => PYTHON_KEYWORDS[token] ?? token);

/** A request example body: the operation's example, else one generated from its schema. */
export function requestBodyExample(operation: RestOperation, schemas: Readonly<Record<string, SchemaNode>>): unknown {
	const body = operation.requestBody;
	if (!body) return undefined;
	return body.example ?? (body.schema ? exampleFromSchema(body.schema, schemas) : undefined);
}

/** The credential header a scheme sends: bearer tokens unless the scheme is `none` or `basic`. */
function authHeader(auth: ReferenceAuth | undefined): SnippetHeader[] {
	if (!auth || auth.scheme === 'none') return [];
	return [auth.scheme === 'basic' ? { name: 'Authorization', value: 'Basic ', variable: 'CREDENTIALS' } : { name: 'Authorization', value: 'Bearer ', variable: 'TOKEN' }];
}

/** Copyable requests for a REST operation, with example values in the URL and body. */
export function requestSnippets(
	operation: RestOperation,
	baseUrl: string,
	schemas: Readonly<Record<string, SchemaNode>>
): Record<SnippetLanguage, string> {
	const valueOf = (parameter: ApiParameter) => parameter.example ?? `{${parameter.name}}`;
	// Placeholders stay readable (`{petId}`), so only real examples are encoded. Encoding
	// covers `'` too, since the URL lands inside single-quoted shell and JavaScript strings.
	const urlValue = (parameter: ApiParameter) =>
		parameter.example === undefined
			? valueOf(parameter)
			: encodeURIComponent(parameter.example).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
	const path = operation.parameters
		.filter((parameter) => parameter.in === 'path')
		.reduce((current, parameter) => current.replace(`{${parameter.name}}`, urlValue(parameter)), operation.path);
	const query = operation.parameters
		.filter((parameter) => parameter.in === 'query' && (parameter.required || parameter.example))
		.map((parameter) => `${encodeURIComponent(parameter.name)}=${urlValue(parameter)}`)
		.join('&');
	const url = `${baseUrl.replace(/\/$/, '')}${path}${query ? `?${query}` : ''}`;
	// Only the credential is a shell or language variable; every other value is literal.
	const headers: SnippetHeader[] = [
		...authHeader(operation.auth),
		...operation.parameters.filter((parameter) => parameter.in === 'header').map((parameter) => ({ name: parameter.name, value: valueOf(parameter) }))
	];
	const body = requestBodyExample(operation, schemas);
	if (body !== undefined) headers.push({ name: 'Content-Type', value: operation.requestBody!.contentType });
	const json = body === undefined ? undefined : JSON.stringify(body, null, 2);
	const method = operation.method;

	const curl = [
		`curl -X ${method} '${url}'`,
		// Double quotes only where the shell must expand $TOKEN.
		...headers.map(({ name, value, variable }) =>
			variable ? `  -H "${name}: ${value}$${variable}"` : `  -H '${name}: ${value.replaceAll("'", "'\\''")}'`
		),
		...(json ? [`  -d '${json.replace(/\n/g, '\n  ')}'`] : [])
	].join(' \\\n');

	const jsString = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
	const jsHeaders = headers.map(
		({ name, value, variable }) => `    ${jsString(name)}: ${variable ? `\`${value}\${${variable}}\`` : jsString(value)}`
	);
	const javascript = [
		`const response = await fetch('${url}', {`,
		`  method: '${method}',`,
		...(jsHeaders.length ? ['  headers: {', jsHeaders.join(',\n'), '  },'] : []),
		...(json ? [`  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),`] : []),
		'});',
		'const data = await response.json();'
	].join('\n');

	const pyHeaders = headers.map(
		({ name, value, variable }) =>
			`    ${JSON.stringify(name)}: ${variable ? `f"${value}{${variable}}"` : JSON.stringify(value)}`
	);
	const python = [
		'import requests',
		'',
		`response = requests.${method.toLowerCase()}(`,
		`    "${url}",`,
		...(pyHeaders.length ? ['    headers={', pyHeaders.map((line) => `    ${line}`).join(',\n'), '    },'] : []),
		...(json ? [`    json=${pythonLiteral(json).replace(/\n/g, '\n    ')},`] : []),
		')',
		'data = response.json()'
	].join('\n');

	return { curl, javascript, python };
}

const GRAPHQL_SCALARS = new Set(['Int', 'Float', 'String', 'Boolean', 'ID']);

/** The note's example query, else one that declares each argument as a variable. */
export function graphqlQuery(operation: GraphqlOperation): string {
	if (operation.example?.query) return operation.example.query;
	const { args } = operation;
	const variables = args.length ? ` (${args.map((arg) => `$${arg.name}: ${arg.type}`).join(', ')})` : '';
	const call = args.length ? `(${args.map((arg) => `${arg.name}: $${arg.name}`).join(', ')})` : '';
	// GraphQL rejects a selection set on a scalar result.
	const returned = operation.returns ? namedType(operation.returns) : undefined;
	const selection = returned && GRAPHQL_SCALARS.has(returned) ? '' : ' {\n    id\n  }';
	return `${operation.kind}${variables} {\n  ${operation.name}${call}${selection}\n}`;
}
