import { isRecord } from '@svartz/ui';
import {
	exampleFromSchema,
	readAuth,
	readSchema,
	type ReferenceAuth,
	type ReferenceBadge,
	type ReferenceHue,
	type SchemaNode
} from '@svartz/ui/reference/runtime';

type Properties = Readonly<Record<string, unknown>>;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const scalarText = (value: unknown) =>
	typeof value === 'number' || typeof value === 'boolean' ? String(value) : text(value);
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);

export { exampleFromSchema, readModel, readSchema, schemaLabel, type SchemaNode, type SchemaProperty } from '@svartz/ui/reference/runtime';

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
	/** The body's media type: `text/markdown`, `image/png`. Without one, a schema or example means JSON. */
	readonly contentType?: string;
	/** From `empty: true`: a response with no body. 204, 205, and 304 responses never have one. */
	readonly empty: boolean;
}

export interface RestOperation {
	readonly protocol: 'rest';
	readonly method: HttpMethod;
	readonly path: string;
	/** The server this operation runs on, when it isn't the theme's `baseUrl`. */
	readonly server?: string;
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
 *     202: { description: Queued, empty: true }
 *     200: { description: The photo, contentType: image/jpeg }
 * ```
 *
 * `server` overrides the theme's `baseUrl` for one operation.
 * `requestBody.contentType` defaults to `application/json`;
 * `application/x-www-form-urlencoded`, `multipart/form-data`, and text types
 * encode the example to match.
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
			example: response.example,
			contentType: text(response.contentType),
			empty: response.empty === true
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
		server: text(raw.server),
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
	if (body.example !== undefined) return body.example;
	return body.schema ? exampleFromSchema(body.schema, schemas) : undefined;
}

const BEARER_SCHEMES = new Set(['bearer', 'oauth2', 'openidconnect']);

/**
 * The credential header a scheme sends: a bearer token for `bearer`, `oauth2`,
 * and `openIdConnect` (or scopes with no scheme), `Basic` for `basic`. Any
 * other scheme sends nothing, since guessing would show the wrong header;
 * document its header as a `header` parameter instead.
 */
function authHeader(auth: ReferenceAuth | undefined): SnippetHeader[] {
	const scheme = auth?.scheme?.toLowerCase() ?? (auth?.scopes.length ? 'bearer' : undefined);
	if (scheme === 'basic') return [{ name: 'Authorization', value: 'Basic ', variable: 'CREDENTIALS' }];
	return scheme && BEARER_SCHEMES.has(scheme) ? [{ name: 'Authorization', value: 'Bearer ', variable: 'TOKEN' }] : [];
}

/** What a response body holds: `undefined` when its metadata doesn't say. */
export type ResponseBody = 'none' | 'json' | 'text' | 'binary';

const BODILESS_STATUS = /^(?:1\d\d|204|205|304)$/;
const JSON_MEDIA = /^application\/(?:[\w.-]+\+)?json\b/i;
const TEXT_MEDIA = /^(?:text\/|application\/(?:[\w.-]+\+)?xml\b|application\/(?:javascript|x-www-form-urlencoded)\b)/i;

export function responseBody(response: ApiResponse): ResponseBody | undefined {
	if (response.empty || BODILESS_STATUS.test(response.status)) return 'none';
	const media = response.contentType;
	if (media) return JSON_MEDIA.test(media) ? 'json' : TEXT_MEDIA.test(media) ? 'text' : 'binary';
	return response.schema || response.example !== undefined ? 'json' : undefined;
}

type Reading = ResponseBody | 'unknown';

/** Successful statuses that read their body the same way. A `2XX` range reads last, as the fallback. */
interface ReadGroup {
	readonly reading: Reading;
	readonly statuses: readonly string[];
}

/** How a snippet reads the result: follow nothing and read `Location` for a redirect-only operation, else per success status. */
function readingPlan(responses: readonly ApiResponse[]): 'redirect' | ReadGroup[] {
	const successes = responses.filter((response) => response.status.startsWith('2'));
	if (successes.length === 0) {
		const redirects = responses.some((response) => response.status.startsWith('3') && response.status !== '304');
		return redirects ? 'redirect' : [{ reading: 'unknown', statuses: [] }];
	}
	const groups = new Map<Reading, string[]>();
	for (const response of successes) {
		const reading = responseBody(response) ?? 'unknown';
		groups.set(reading, [...(groups.get(reading) ?? []), response.status]);
	}
	const exact = (group: ReadGroup) => group.statuses.every((status) => /^\d+$/.test(status));
	return [...groups].map(([reading, statuses]) => ({ reading, statuses })).sort((left, right) => Number(exact(right)) - Number(exact(left)));
}

const JS_READ: Record<Reading, string> = {
	json: 'await response.json()',
	text: 'await response.text()',
	binary: 'await response.blob()',
	none: 'null',
	unknown: 'await response.text()'
};
const PYTHON_READ: Record<Reading, string> = { json: 'response.json()', text: 'response.text', binary: 'response.content', none: 'None', unknown: 'response.text' };
/** One reading names its result for what it holds; several share `data`. */
const JS_NAME: Record<Reading, string> = { json: 'data', text: 'text', binary: 'blob', none: '', unknown: 'text' };
const PYTHON_NAME: Record<Reading, string> = { ...JS_NAME, binary: 'content' };

function readJavascript(groups: readonly ReadGroup[]): string[] {
	const check = ['if (!response.ok) throw new Error(`Request failed: ${response.status}`);'];
	if (groups.length === 1) {
		const [{ reading }] = groups;
		return reading === 'none' ? check : [...check, `const ${JS_NAME[reading]} = ${JS_READ[reading]};`];
	}
	const branches = groups.slice(0, -1).map(({ reading, statuses }) =>
		statuses.length === 1 ? `response.status === ${statuses[0]} ? ${JS_READ[reading]}` : `[${statuses.join(', ')}].includes(response.status) ? ${JS_READ[reading]}`
	);
	return [...check, `const data = ${branches.join('\n  : ')}\n  : ${JS_READ[groups.at(-1)!.reading]};`];
}

function readPython(groups: readonly ReadGroup[]): string[] {
	const check = ['response.raise_for_status()'];
	if (groups.length === 1) {
		const [{ reading }] = groups;
		return reading === 'none' ? check : [...check, `${PYTHON_NAME[reading]} = ${PYTHON_READ[reading]}`];
	}
	return [
		...check,
		...groups.flatMap(({ reading, statuses }, index) => [
			index === groups.length - 1
				? 'else:'
				: `${index === 0 ? 'if' : 'elif'} response.status_code ${statuses.length === 1 ? `== ${statuses[0]}` : `in (${statuses.join(', ')})`}:`,
			`    data = ${PYTHON_READ[reading]}`
		])
	];
}

type BodyEncoding = 'json' | 'form' | 'multipart' | 'raw';

const encodingOf = (contentType: string): BodyEncoding =>
	JSON_MEDIA.test(contentType)
		? 'json'
		: /^application\/x-www-form-urlencoded\b/i.test(contentType)
			? 'form'
			: /^multipart\/form-data\b/i.test(contentType)
				? 'multipart'
				: 'raw';

/** A body example as form fields: arrays repeat their name, objects send as JSON, `null` is left out. */
const formFields = (body: unknown): (readonly [string, string])[] =>
	isRecord(body)
		? Object.entries(body).flatMap(([name, value]) =>
				(Array.isArray(value) ? value : [value])
					.filter((item) => item !== null && item !== undefined)
					.map((item) => [name, typeof item === 'object' ? JSON.stringify(item) : String(item)] as const)
			)
		: [];

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** A saved binary response's file name, with the media type's extension when it has a plain one. */
function outputName(responses: readonly ApiResponse[]): string {
	const media = responses.find((response) => response.status.startsWith('2') && responseBody(response) === 'binary')?.contentType;
	const extension = media?.match(/^[\w.-]+\/([a-z0-9]+)$/i)?.[1];
	return extension && extension !== 'octet-stream' ? `response.${extension}` : 'response';
}

/**
 * Copyable requests for a REST operation, with example values in the URL and
 * body. Each snippet encodes the body for its content type and reads every
 * documented success the way its status and content type allow: no body for
 * 204 or `empty: true`, text, binary, or JSON.
 */
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
	const root = (operation.server ?? baseUrl).replace(/\/$/, '');
	const url = `${root}${path}${query ? `?${query}` : ''}`;
	// Only the credential is a shell or language variable; every other value is literal.
	const headers: SnippetHeader[] = [
		...authHeader(operation.auth),
		...operation.parameters.filter((parameter) => parameter.in === 'header').map((parameter) => ({ name: parameter.name, value: valueOf(parameter) }))
	];
	const body = requestBodyExample(operation, schemas);
	const contentType = operation.requestBody?.contentType ?? 'application/json';
	const encoding = body === undefined ? undefined : encodingOf(contentType);
	// Forms set their own Content-Type; multipart must, to name its boundary.
	if (encoding === 'json' || encoding === 'raw') headers.push({ name: 'Content-Type', value: contentType });
	const json = encoding === 'json' ? JSON.stringify(body, null, 2) : undefined;
	const raw = encoding === 'raw' ? (typeof body === 'string' ? body : JSON.stringify(body, null, 2)) : undefined;
	const fields = encoding === 'form' || encoding === 'multipart' ? formFields(body) : [];
	const plan = readingPlan(operation.responses);
	const redirect = plan === 'redirect';
	const binary = !redirect && plan.some((group) => group.reading === 'binary');
	const method = operation.method;

	const curl = [
		`curl${redirect ? ' -i' : ''} -X ${method} ${shellQuote(url)}`,
		// Double quotes only where the shell must expand $TOKEN.
		...headers.map(({ name, value, variable }) => (variable ? `  -H "${name}: ${value}$${variable}"` : `  -H ${shellQuote(`${name}: ${value}`)}`)),
		...(json ? [`  -d ${shellQuote(json).replace(/\n/g, '\n  ')}`] : []),
		...(raw !== undefined ? [`  --data-binary ${shellQuote(raw)}`] : []),
		...fields.map(([name, value]) => `  ${encoding === 'form' ? '--data-urlencode' : '--form-string'} ${shellQuote(`${name}=${value}`)}`),
		...(binary ? [`  -o ${outputName(operation.responses)}`] : [])
	].join(' \\\n');

	const jsString = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
	const jsHeaders = headers.map(
		({ name, value, variable }) => `    ${jsString(name)}: ${variable ? `\`${value}\${${variable}}\`` : jsString(value)}`
	);
	const unique = new Set(fields.map(([name]) => name)).size === fields.length;
	const jsFields = JSON.stringify(unique ? Object.fromEntries(fields) : fields, null, 2).replace(/\n/g, '\n  ');
	const javascript = [
		...(encoding === 'multipart' ? ['const form = new FormData();', ...fields.map(([name, value]) => `form.append(${jsString(name)}, ${JSON.stringify(value)});`), ''] : []),
		`const response = await fetch(${jsString(url)}, {`,
		`  method: '${method}',`,
		...(jsHeaders.length ? ['  headers: {', jsHeaders.join(',\n'), '  },'] : []),
		...(json ? [`  body: JSON.stringify(${json.replace(/\n/g, '\n  ')}),`] : []),
		...(raw !== undefined ? [`  body: ${JSON.stringify(raw)},`] : []),
		...(encoding === 'form' ? [`  body: new URLSearchParams(${jsFields}),`] : []),
		...(encoding === 'multipart' ? ['  body: form,'] : []),
		...(redirect ? ["  redirect: 'manual',"] : []),
		'});',
		...(redirect ? ["const location = response.headers.get('location');"] : readJavascript(plan))
	].join('\n');

	const pyHeaders = headers.map(
		({ name, value, variable }) =>
			`    ${JSON.stringify(name)}: ${variable ? `f"${value}{${variable}}"` : JSON.stringify(value)}`
	);
	// Requests repeats a field whose value is a list.
	const formDict = Object.fromEntries(
		[...new Set(fields.map(([name]) => name))].map((name) => {
			const values = fields.filter(([field]) => field === name).map(([, value]) => value);
			return [name, values.length === 1 ? values[0] : values];
		})
	);
	const python = [
		'import requests',
		'',
		`response = requests.${method.toLowerCase()}(`,
		`    ${JSON.stringify(url)},`,
		...(pyHeaders.length ? ['    headers={', pyHeaders.map((line) => `    ${line}`).join(',\n'), '    },'] : []),
		...(json ? [`    json=${pythonLiteral(json).replace(/\n/g, '\n    ')},`] : []),
		...(raw !== undefined ? [`    data=${JSON.stringify(raw)},`] : []),
		...(encoding === 'form' ? [`    data=${JSON.stringify(formDict, null, 4).replace(/\n/g, '\n    ')},`] : []),
		// `(None, value)` sends a plain field rather than a file; a list keeps repeated names.
		...(encoding === 'multipart'
			? ['    files=[', fields.map(([name, value]) => `        (${JSON.stringify(name)}, (None, ${JSON.stringify(value)}))`).join(',\n'), '    ],']
			: []),
		...(redirect ? ['    allow_redirects=False,'] : []),
		')',
		...(redirect ? ['location = response.headers["Location"]'] : readPython(plan))
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
