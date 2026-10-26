import { exampleFromSchema, readAuth, readSchema, type ReferenceAuth, type ReferenceBadge, type SchemaNode } from '@svartz/ui/reference/runtime';

type Properties = Readonly<Record<string, unknown>>;

/** Amber: no HTTP method badge uses it, so tools stand apart in a mixed sidebar. */
export const TOOL_BADGE: ReferenceBadge = { label: 'TOOL', hue: 'amber' };

const isRecord = (value: unknown): value is Properties => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * Behaviour hints a server declares for a tool. They describe the tool; a
 * client can't rely on them for safety, since any server can claim them.
 */
export interface McpToolAnnotations {
	readonly title?: string;
	readonly readOnlyHint?: boolean;
	readonly destructiveHint?: boolean;
	readonly idempotentHint?: boolean;
	readonly openWorldHint?: boolean;
}

const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const;

/** One MCP content block, as the server sends it: `text`, `image`, `audio`, `resource_link`, or `resource`. */
export type McpContentBlock = Properties & { readonly type: string };

/** A `tools/call` result. `isError` marks a tool that ran and failed; the call itself succeeded. */
export interface McpToolResult {
	readonly content: readonly McpContentBlock[];
	readonly structuredContent?: unknown;
	readonly isError: boolean;
}

/** A JSON-RPC error: the server rejected the request, so there is no tool result. */
export interface JsonRpcError {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}

/** One `tools/call` example: the arguments, and the result or JSON-RPC error that came back. */
export interface McpToolExample {
	readonly title?: string;
	readonly arguments: Properties;
	readonly result?: McpToolResult;
	readonly error?: JsonRpcError;
}

/**
 * An MCP tool page, from `operation` metadata with `protocol: mcp`.
 *
 * ```yaml
 * operation:
 *   protocol: mcp
 *   kind: tool                 # resources and prompts are reserved for later
 *   name: call_operation
 *   endpoint: /mcp/admin       # the server's HTTP endpoint, not the tool's
 *   auth: { scheme: bearer, description: "A person's `lla_` token" }
 *   inputSchema: { type: object, required: [operation_id], properties: { operation_id: { type: string } } }
 *   outputSchema: { type: object, properties: { status: { type: string } } }
 *   annotations: { destructiveHint: true }
 *   examples:
 *     - title: Read the channels
 *       arguments: { operation_id: list_guild_channels }
 *       result: { structuredContent: { status: done } }
 *     - title: Unknown tool
 *       error: { code: -32602, message: "Unknown tool" }
 * ```
 */
export interface McpTool {
	readonly kind: 'tool';
	readonly name: string;
	/** The display name a client shows (`title`, else `annotations.title`). */
	readonly title?: string;
	readonly endpoint?: string;
	readonly auth?: ReferenceAuth;
	/** The tool's arguments. A tool without one takes no arguments. */
	readonly inputSchema: SchemaNode;
	/** The schema `structuredContent` follows, when the tool declares one. */
	readonly outputSchema?: SchemaNode;
	readonly annotations: McpToolAnnotations;
	readonly examples: readonly McpToolExample[];
}

const NO_ARGUMENTS: SchemaNode = { type: 'object', properties: [] };

function readResult(raw: Properties): McpToolResult {
	const authored = Array.isArray(raw.content) ? raw.content.filter((block): block is McpContentBlock => isRecord(block) && typeof block.type === 'string') : undefined;
	// The spec asks servers that return structured content to repeat it as JSON text.
	const content =
		authored ?? (raw.structuredContent === undefined ? [] : [{ type: 'text', text: JSON.stringify(raw.structuredContent) }]);
	return { content, structuredContent: raw.structuredContent, isError: raw.isError === true };
}

function readError(raw: Properties): JsonRpcError | undefined {
	const message = text(raw.message);
	if (typeof raw.code !== 'number' || !Number.isInteger(raw.code) || !message) {
		throw new Error('each example `error` needs an integer `code` and a `message`.');
	}
	return { code: raw.code, message, ...(raw.data === undefined ? {} : { data: raw.data }) };
}

function readExample(raw: Properties): McpToolExample {
	if (isRecord(raw.result) && isRecord(raw.error)) throw new Error('an example has both `result` and `error`; a call returns one.');
	return {
		title: text(raw.title),
		arguments: isRecord(raw.arguments) ? raw.arguments : {},
		result: isRecord(raw.result) ? readResult(raw.result) : undefined,
		error: isRecord(raw.error) ? readError(raw.error) : undefined
	};
}

/** An MCP tool from a page's `operation` metadata. Throws with the reason when the metadata isn't a tool. */
export function readMcpTool(properties: Properties): McpTool | undefined {
	const raw = properties.operation;
	if (!isRecord(raw) || raw.protocol !== 'mcp') return undefined;
	const kind = text(raw.kind) ?? 'tool';
	if (kind === 'resource' || kind === 'prompt') throw new Error(`MCP ${kind} pages aren't supported yet. Write this page as a guide for now.`);
	if (kind !== 'tool') throw new Error(`\`kind: ${kind}\` isn't an MCP kind. Use \`kind: tool\`.`);
	const name = text(raw.name);
	if (!name) throw new Error('an MCP tool needs a `name`.');
	const annotations = isRecord(raw.annotations) ? raw.annotations : {};
	return {
		kind,
		name,
		title: text(raw.title) ?? text(annotations.title),
		endpoint: text(raw.endpoint),
		auth: readAuth(raw.auth),
		inputSchema: readSchema(raw.inputSchema) ?? NO_ARGUMENTS,
		outputSchema: readSchema(raw.outputSchema),
		annotations: {
			title: text(annotations.title),
			...Object.fromEntries(HINTS.flatMap((hint) => (typeof annotations[hint] === 'boolean' ? [[hint, annotations[hint]]] : [])))
		},
		examples: Array.isArray(raw.examples) ? raw.examples.filter(isRecord).map(readExample) : []
	};
}

/** The annotations a tool declares, as `[hint, value]` pairs in the spec's order. */
export const declaredHints = (annotations: McpToolAnnotations) =>
	HINTS.flatMap((hint) => (annotations[hint] === undefined ? [] : [[hint, annotations[hint]] as const]));

// --- Examples ----------------------------------------------------------------

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The tool's examples, or one generated from its input schema when it has none. */
export function toolExamples(tool: McpTool, schemas: Readonly<Record<string, SchemaNode>>): readonly McpToolExample[] {
	if (tool.examples.length > 0) return tool.examples;
	const generated = exampleFromSchema(tool.inputSchema, schemas);
	return [{ arguments: isRecord(generated) ? generated : {} }];
}

/** The JSON-RPC request a client sends to call the tool. */
export const callMessage = (tool: Pick<McpTool, 'name'>, example: McpToolExample, id = 1) =>
	json({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool.name, arguments: example.arguments } });

/** The JSON-RPC response to that request: a result, which may carry `isError`, or an error. */
export function responseMessage(example: McpToolExample, id = 1): string | undefined {
	if (example.error) return json({ jsonrpc: '2.0', id, error: example.error });
	if (!example.result) return undefined;
	const { content, structuredContent, isError } = example.result;
	return json({
		jsonrpc: '2.0',
		id,
		result: { content, ...(structuredContent === undefined ? {} : { structuredContent }), ...(isError ? { isError } : {}) }
	});
}

/** Where a tool's server listens. A path joins the theme's `baseUrl` when one is set. */
export function endpointUrl(endpoint: string | undefined, themeConfig: Readonly<Record<string, unknown>>): string | undefined {
	const baseUrl = text(themeConfig.baseUrl);
	if (!endpoint || !endpoint.startsWith('/') || !baseUrl) return endpoint;
	return `${baseUrl.replace(/\/$/, '')}${endpoint}`;
}
