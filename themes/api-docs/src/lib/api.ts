import { isRecord } from '@svartz/ui';
import {
	exampleFromSchema,
	readAuth,
	readSchema,
	type CodeTab,
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
/** A WebSocket streams like a GraphQL subscription, so it shares the hue. */
export const WEBSOCKET_BADGE: ReferenceBadge = { label: 'WS', hue: GRAPHQL_KINDS.subscription };
export const endpointBadge = (operation: RestOperation | WebSocketOperation): ReferenceBadge =>
	operation.protocol === 'websocket' ? WEBSOCKET_BADGE : methodBadge(operation.method);
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
	/** Example response headers, in order: `Location`, `Set-Cookie`. */
	readonly headers: readonly (readonly [name: string, value: string])[];
}

/** What REST and WebSocket endpoints share: a path on a server, reached with an HTTP request. */
interface HttpEndpoint {
	readonly path: string;
	/** The server this operation runs on, when it isn't the theme's `baseUrl`. */
	readonly server?: string;
	readonly auth?: ReferenceAuth;
	readonly parameters: readonly ApiParameter[];
	readonly responses: readonly ApiResponse[];
}

export interface RestOperation extends HttpEndpoint {
	readonly protocol: 'rest';
	readonly method: HttpMethod;
	/** `browser` for pages and form actions a browser requests with its session, `api` for everything else. */
	readonly client: 'api' | 'browser';
	readonly requestBody?: { readonly contentType: string; readonly schema?: SchemaNode; readonly example?: unknown };
}

/** One kind of WebSocket message, by who sends it: the client (`send`) or the server (`receive`). */
export interface SocketMessage {
	readonly direction: 'send' | 'receive';
	readonly name: string;
	readonly description?: string;
	readonly schema?: SchemaNode;
	/** A string sends as a text frame as written; anything else as JSON. */
	readonly example?: unknown;
}

/** A WebSocket endpoint: the upgrade request's parameters and responses, then the messages over the open socket. */
export interface WebSocketOperation extends HttpEndpoint {
	readonly protocol: 'websocket';
	readonly messages: readonly SocketMessage[];
	readonly close: readonly { readonly code: string; readonly description?: string }[];
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
 * encode the example to match. A response's `headers` map names to example
 * values. `client: browser` marks a page or form action, shown as an HTML form
 * and a raw HTTP request rather than API client code.
 *
 * `protocol: websocket` takes the same `path`, `server`, `auth`, `parameters`,
 * and `responses` for the upgrade request, plus the messages and close codes:
 *
 * ```yaml
 * operation:
 *   protocol: websocket
 *   path: /v1/stream
 *   responses: { 101: { description: Switching Protocols }, 429: { description: Too many sockets } }
 *   messages:
 *     - { direction: send, name: ping, example: ping }
 *     - { direction: receive, name: digest, schema: { $ref: Digest } }
 *   close: { 4003: The token lost its scope. }
 * ```
 */
export type ApiOperation = RestOperation | WebSocketOperation | GraphqlOperation;

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
			empty: response.empty === true,
			headers: isRecord(response.headers)
				? Object.entries(response.headers).flatMap(([name, value]) => {
						const example = scalarText(value);
						return example === undefined ? [] : [[name, example] as const];
					})
				: []
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

/** A REST, WebSocket, or GraphQL operation from a page's `operation` metadata, or `undefined` when it isn't one. */
export function readOperation(properties: Properties): ApiOperation | undefined {
	const raw = properties.operation;
	if (!isRecord(raw)) return undefined;
	if (raw.protocol === 'graphql') return readGraphql(raw);
	const path = text(raw.path);
	if (!path) return undefined;
	const endpoint: HttpEndpoint = {
		path,
		server: text(raw.server),
		auth: readAuth(raw.auth),
		parameters: records(raw.parameters).flatMap(readParameter),
		responses: readResponses(raw.responses)
	};
	if (raw.protocol === 'websocket') return readWebSocket(raw, endpoint);
	if (raw.protocol !== undefined && raw.protocol !== 'rest') return undefined;
	const method = text(raw.method)?.toUpperCase();
	if (!method || !(method in HTTP_METHODS)) return undefined;
	const body = isRecord(raw.requestBody) ? raw.requestBody : undefined;
	return {
		protocol: 'rest',
		method: method as HttpMethod,
		client: raw.client === 'browser' ? 'browser' : 'api',
		...endpoint,
		requestBody: body && {
			contentType: text(body.contentType) ?? 'application/json',
			schema: readSchema(body.schema),
			example: body.example
		}
	};
}

const DIRECTIONS = ['send', 'receive'] as const;

function readWebSocket(raw: Properties, endpoint: HttpEndpoint): WebSocketOperation {
	return {
		protocol: 'websocket',
		...endpoint,
		messages: records(raw.messages).flatMap((message): SocketMessage[] => {
			const direction = DIRECTIONS.find((candidate) => candidate === message.direction);
			const name = text(message.name);
			return direction && name
				? [{ direction, name, description: text(message.description), schema: readSchema(message.schema), example: message.example }]
				: [];
		}),
		close: isRecord(raw.close) ? Object.entries(raw.close).map(([code, description]) => ({ code, description: text(description) })) : []
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
	const isExact = (status: string) => /^\d+$/.test(status);
	// A `2XX` range can still answer 204 or 205, which have no body to read.
	if (successes.some((response) => !isExact(response.status))) {
		groups.set('none', [...new Set([...(groups.get('none') ?? []), '204', '205'])]);
	}
	const exact = (group: ReadGroup) => group.statuses.every(isExact);
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
const jsString = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

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
const valueOf = (parameter: ApiParameter) => parameter.example ?? `{${parameter.name}}`;

/**
 * An endpoint's request with example values: the server root, the path and
 * query it requests, and its headers. A path that already has a query, such as
 * a SvelteKit form action (`/login?/signIn`), joins the parameters with `&`.
 */
function requestOf(operation: HttpEndpoint, baseUrl: string) {
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
	const target = `${path}${query ? `${path.includes('?') ? '&' : '?'}${query}` : ''}`;
	// Only the credential is a shell or language variable; every other value is literal.
	const headers: SnippetHeader[] = [
		...authHeader(operation.auth),
		...operation.parameters.filter((parameter) => parameter.in === 'header').map((parameter) => ({ name: parameter.name, value: valueOf(parameter) }))
	];
	return { root, target, url: `${root}${target}`, headers };
}

export function requestSnippets(
	operation: RestOperation,
	baseUrl: string,
	schemas: Readonly<Record<string, SchemaNode>>
): Record<SnippetLanguage, string> {
	const { url, headers } = requestOf(operation, baseUrl);
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
		...(raw !== undefined ? [`  --data-raw ${shellQuote(raw)}`] : []),
		...fields.map(([name, value]) => `  ${encoding === 'form' ? '--data-urlencode' : '--form-string'} ${shellQuote(`${name}=${value}`)}`),
		...(binary ? [`  -o ${outputName(operation.responses)}`] : [])
	].join(' \\\n');

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
		...(redirect
			? ['// Browsers hide redirect headers, so run this server-side (Node, Deno, Bun).', "const location = response.headers.get('location');"]
			: readJavascript(plan))
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

export type BrowserLanguage = 'html' | 'http';
export const BROWSER_LANGUAGES: readonly { readonly id: BrowserLanguage; readonly label: string }[] = [
	{ id: 'html', label: 'HTML' },
	{ id: 'http', label: 'HTTP' }
];

const MULTIPART_BOUNDARY = 'svartz-example';
const htmlAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/**
 * A browser route's request: the raw HTTP request, with cookie parameters as
 * its `Cookie` header, and an HTML form when a form can send it (a POST with no
 * body or a form body). Both target the path alone, since the site's own pages
 * send them.
 */
export function browserSnippets(
	operation: RestOperation,
	baseUrl: string,
	schemas: Readonly<Record<string, SchemaNode>>
): { readonly html?: string; readonly http: string } {
	const { root, target, headers } = requestOf(operation, baseUrl);
	const server = URL.canParse(root) ? new URL(root) : undefined;
	const requestTarget = `${server ? server.pathname.replace(/\/$/, '') : root}${target}`;
	const body = requestBodyExample(operation, schemas);
	const contentType = operation.requestBody?.contentType ?? 'application/json';
	const encoding = body === undefined ? undefined : encodingOf(contentType);
	const fields = encoding === 'form' || encoding === 'multipart' ? formFields(body) : [];
	const cookies = operation.parameters.filter((parameter) => parameter.in === 'cookie').map((parameter) => `${parameter.name}=${valueOf(parameter)}`);
	const payload =
		encoding === 'form'
			? new URLSearchParams(fields.map(([name, value]) => [name, value])).toString()
			: encoding === 'multipart'
				? [...fields.flatMap(([name, value]) => [`--${MULTIPART_BOUNDARY}`, `Content-Disposition: form-data; name="${name}"`, '', value]), `--${MULTIPART_BOUNDARY}--`].join('\n')
				: encoding === undefined
					? undefined
					: typeof body === 'string' && encoding === 'raw'
						? body
						: JSON.stringify(body, null, 2);
	const sentType =
		encoding === 'form' ? 'application/x-www-form-urlencoded' : encoding === 'multipart' ? `multipart/form-data; boundary=${MULTIPART_BOUNDARY}` : contentType;
	const http = [
		`${operation.method} ${requestTarget} HTTP/1.1`,
		...(server ? [`Host: ${server.host}`] : []),
		...headers.map(({ name, value, variable }) => `${name}: ${value}${variable ? `$${variable}` : ''}`),
		...(cookies.length ? [`Cookie: ${cookies.join('; ')}`] : []),
		...(payload === undefined ? [] : [`Content-Type: ${sentType}`, '', payload])
	].join('\n');

	const formable = operation.method === 'POST' && (encoding === undefined || encoding === 'form' || encoding === 'multipart');
	const html = formable
		? [
				`<form method="post" action="${htmlAttribute(requestTarget)}"${encoding === 'multipart' ? ' enctype="multipart/form-data"' : ''}>`,
				...fields.map(([name, value]) => `  <input type="hidden" name="${htmlAttribute(name)}" value="${htmlAttribute(value)}" />`),
				'  <button>Submit</button>',
				'</form>'
			].join('\n')
		: undefined;
	return { html, http };
}

export type SocketLanguage = 'websocat' | 'javascript' | 'python';
export const SOCKET_LANGUAGES: readonly { readonly id: SocketLanguage; readonly label: string }[] = [
	{ id: 'websocat', label: 'websocat' },
	{ id: 'javascript', label: 'JavaScript' },
	{ id: 'python', label: 'Python' }
];

/** A message's example, else one generated from its schema. */
export const messageExample = (message: SocketMessage, schemas: Readonly<Record<string, SchemaNode>>): unknown =>
	message.example !== undefined ? message.example : message.schema ? exampleFromSchema(message.schema, schemas) : undefined;

/** A message example as its frame: a string as written, anything else as JSON. */
export const frameText = (example: unknown, indent?: number) => (typeof example === 'string' ? example : JSON.stringify(example, null, indent));

/**
 * Code that opens the socket with the upgrade's example query and headers,
 * sends the first `send` message's example, and prints what arrives: parsed
 * JSON when every received message is JSON, else the text. websocat stays
 * interactive, so the reader types what to send.
 */
export function socketSnippets(
	operation: WebSocketOperation,
	baseUrl: string,
	schemas: Readonly<Record<string, SchemaNode>>
): Record<SocketLanguage, string> {
	const { url: httpUrl, headers } = requestOf(operation, baseUrl);
	const url = httpUrl.replace(/^http/i, 'ws');
	const first = operation.messages.find((message) => message.direction === 'send');
	const sent = first && messageExample(first, schemas);
	const frame = sent === undefined ? undefined : frameText(sent);
	const received = operation.messages.filter((message) => message.direction === 'receive');
	const json = received.length > 0 && received.every((message) => !['string', 'undefined'].includes(typeof messageExample(message, schemas)));

	const websocat = [
		'websocat',
		...headers.map(({ name, value, variable }) => (variable ? `  -H "${name}: ${value}$${variable}"` : `  -H ${shellQuote(`${name}: ${value}`)}`)),
		`  ${shellQuote(url)}`
	].join(' \\\n');

	const jsHeaders = headers.map(({ name, value, variable }) => `    ${jsString(name)}: ${variable ? `\`${value}\${${variable}}\`` : jsString(value)}`);
	const javascript = [
		...(jsHeaders.length
			? [
					"// Browsers can't set WebSocket headers; Node 22 and later can.",
					`const socket = new WebSocket(${jsString(url)}, {`,
					'  headers: {',
					jsHeaders.join(',\n'),
					'  }',
					'});'
				]
			: [`const socket = new WebSocket(${jsString(url)});`]),
		...(frame === undefined ? [] : [`socket.addEventListener('open', () => socket.send(${jsString(frame)}));`]),
		`socket.addEventListener('message', (event) => console.log(${json ? 'JSON.parse(event.data)' : 'event.data'}));`,
		"socket.addEventListener('close', (event) => console.log('Closed:', event.code, event.reason));"
	].join('\n');

	const pyHeaders = headers.map(
		({ name, value, variable }) => `            ${JSON.stringify(name)}: ${variable ? `f"${value}{${variable}}"` : JSON.stringify(value)},`
	);
	const python = [
		'import asyncio',
		...(json ? ['import json'] : []),
		'',
		'from websockets.asyncio.client import connect',
		'',
		'',
		'async def main():',
		...(pyHeaders.length
			? ['    async with connect(', `        ${JSON.stringify(url)},`, '        additional_headers={', ...pyHeaders, '        },', '    ) as socket:']
			: [`    async with connect(${JSON.stringify(url)}) as socket:`]),
		...(frame === undefined ? [] : [`        await socket.send(${JSON.stringify(frame)})`]),
		'        async for message in socket:',
		`            print(${json ? 'json.loads(message)' : 'message'})`,
		'',
		'',
		'asyncio.run(main())'
	].join('\n');

	return { websocat, javascript, python };
}

/** Reason phrases for the statuses references document most. */
const REASONS: Readonly<Record<string, string>> = {
	101: 'Switching Protocols',
	200: 'OK',
	201: 'Created',
	202: 'Accepted',
	204: 'No Content',
	301: 'Moved Permanently',
	302: 'Found',
	303: 'See Other',
	304: 'Not Modified',
	307: 'Temporary Redirect',
	308: 'Permanent Redirect',
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	405: 'Method Not Allowed',
	409: 'Conflict',
	415: 'Unsupported Media Type',
	422: 'Unprocessable Content',
	426: 'Upgrade Required',
	429: 'Too Many Requests',
	500: 'Internal Server Error',
	502: 'Bad Gateway',
	503: 'Service Unavailable'
};

/**
 * A response example per status: its body as JSON or text. A response with
 * `headers` shows as HTTP, its status line and headers above the body, so a
 * redirect shows where it goes. Statuses with nothing to show get no tab.
 */
export function responseTabs(responses: readonly ApiResponse[], schemas: Readonly<Record<string, SchemaNode>>): CodeTab[] {
	return responses.flatMap((response): CodeTab[] => {
		const body = responseBody(response);
		// An authored `null` is a real example.
		const example =
			body === 'none' || body === 'binary'
				? undefined
				: response.example !== undefined
					? response.example
					: response.schema
						? exampleFromSchema(response.schema, schemas)
						: undefined;
		// A text body shows as written: Markdown stays Markdown.
		const shown = example === undefined ? undefined : body === 'text' && typeof example === 'string' ? example : JSON.stringify(example, null, 2);
		const head = response.headers.length
			? [`HTTP/1.1 ${response.status}${REASONS[response.status] ? ` ${REASONS[response.status]}` : ''}`, ...response.headers.map(([name, value]) => `${name}: ${value}`)].join('\n')
			: undefined;
		const code = head && shown !== undefined ? `${head}\n\n${shown}` : (head ?? shown);
		return code === undefined ? [] : [{ id: response.status, label: response.status, code }];
	});
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
