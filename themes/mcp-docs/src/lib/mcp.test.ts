import { describe, expect, it } from 'vitest';
import { callMessage, declaredHints, endpointUrl, readMcpTool, responseMessage, toolExamples } from './mcp.js';

const callOperation = {
	operation: {
		protocol: 'mcp',
		kind: 'tool',
		name: 'call_operation',
		endpoint: '/mcp/admin',
		inputSchema: {
			type: 'object',
			required: ['operation_id'],
			properties: { operation_id: { type: 'string', maxLength: 100 }, params: { type: 'object', additionalProperties: { type: 'string' }, default: {} } }
		},
		annotations: { destructiveHint: true, openWorldHint: true, unknownHint: 'ignored' },
		examples: [
			{ title: 'Read', arguments: { operation_id: 'list_guild_channels' }, result: { structuredContent: { status: 'done', answer: [] } } },
			{ title: 'Forbidden', arguments: { operation_id: 'ban' }, result: { isError: true, content: [{ type: 'text', text: 'forbidden' }] } },
			{ title: 'Unknown tool', arguments: {}, error: { code: -32602, message: 'Unknown tool: call_operations' } },
			{ title: 'Screenshot', arguments: {}, result: { content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }] } }
		]
	}
};

describe('readMcpTool', () => {
	it('reads the name, server, input schema, and only the annotations the spec defines', () => {
		const tool = readMcpTool(callOperation)!;
		expect([tool.name, tool.endpoint, tool.inputSchema.properties?.map((property) => [property.name, property.required])]).toEqual([
			'call_operation',
			'/mcp/admin',
			[['operation_id', true], ['params', false]]
		]);
		expect(declaredHints(tool.annotations)).toEqual([['destructiveHint', true], ['openWorldHint', true]]);
	});

	it.each([
		['a resource page, reserved for later', { kind: 'resource', name: 'logs' }, "MCP resource pages aren't supported yet"],
		['a tool without a name', { kind: 'tool' }, 'an MCP tool needs a `name`'],
		['an example with both a result and an error', { name: 'x', examples: [{ result: {}, error: { code: 1, message: 'm' } }] }, 'has both `result` and `error`'],
		['a JSON-RPC error without a code', { name: 'x', examples: [{ error: { message: 'm' } }] }, 'integer `code` and a `message`']
	])('rejects %s with the reason', (_, operation, reason) => {
		expect(() => readMcpTool({ operation: { protocol: 'mcp', ...operation } })).toThrow(reason);
	});
});

describe('tools/call messages', () => {
	const tool = readMcpTool(callOperation)!;
	const [read, forbidden, unknown, screenshot] = tool.examples.map((example) => JSON.parse(responseMessage(example)!));

	it('sends the tool name and arguments as a JSON-RPC tools/call request', () => {
		expect(JSON.parse(callMessage(tool, tool.examples[0]!))).toEqual({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'call_operation', arguments: { operation_id: 'list_guild_channels' } }
		});
	});

	it('keeps tool errors as results with isError, and JSON-RPC errors as errors with no result', () => {
		expect(forbidden).toEqual({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'forbidden' }], isError: true } });
		expect(unknown).toEqual({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: call_operations' } });
	});

	it('repeats structured content as a text block, as the spec asks, and passes other content blocks through', () => {
		expect(read.result).toEqual({
			content: [{ type: 'text', text: '{"status":"done","answer":[]}' }],
			structuredContent: { status: 'done', answer: [] }
		});
		expect(screenshot.result).toEqual({ content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }] });
	});

	it('generates request arguments from the input schema when a tool has no examples', () => {
		const bare = readMcpTool({ operation: { ...callOperation.operation, examples: undefined } })!;
		expect(toolExamples(bare, {})).toEqual([{ arguments: { operation_id: 'string', params: {} } }]);
	});
});

describe('endpointUrl', () => {
	it('joins a path to the theme baseUrl and leaves full URLs alone', () => {
		expect(endpointUrl('/mcp/admin', { baseUrl: 'https://relay.example/' })).toBe('https://relay.example/mcp/admin');
		expect(endpointUrl('https://other.example/mcp', { baseUrl: 'https://relay.example' })).toBe('https://other.example/mcp');
		expect(endpointUrl('/mcp', {})).toBe('/mcp');
	});
});
