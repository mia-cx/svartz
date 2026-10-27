import { describe, expect, it } from 'vitest';
import { browserSnippets, graphqlQuery, readOperation, requestSnippets, responseTabs } from './api.js';

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
		expect(operation).toMatchObject({ protocol: 'rest', method: 'POST', path: '/pets/{petId}/photos', auth: { scheme: 'bearer' } });
		expect(operation?.protocol === 'rest' && operation.responses.map((response) => response.status)).toEqual(['201', '404']);
	});

	it("gives each parameter a schema with its default and allowed values, from `type` or the parameter's own `schema`", () => {
		const operation = readOperation({
			operation: {
				method: 'get',
				path: '/pets',
				parameters: [
					{ name: 'limit', in: 'query', type: 'integer', default: 20, description: 'Page size.' },
					{ name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'adopted'] } }
				]
			}
		});
		if (operation?.protocol !== 'rest') throw new Error('expected a REST operation');
		expect(operation.parameters.map(({ name, required, schema }) => [name, required, schema.type, schema.default, schema.enum, schema.description])).toEqual([
			['limit', false, 'integer', 20, undefined, 'Page size.'],
			['status', false, 'string', undefined, ['available', 'adopted'], undefined]
		]);
	});

	it('reads a GraphQL operation', () => {
		expect(
			readOperation({ operation: { protocol: 'graphql', kind: 'query', name: 'pet', returns: '[[Pet]]', args: [{ name: 'id', type: 'ID!', required: true }] } })
		).toMatchObject({ protocol: 'graphql', kind: 'query', name: 'pet', returns: '[[Pet]]' });
	});

	it('rejects unknown methods and missing paths', () => {
		expect(readOperation({ operation: { protocol: 'rest', method: 'fetch', path: '/x' } })).toBeUndefined();
		expect(readOperation({ operation: { protocol: 'rest', method: 'get' } })).toBeUndefined();
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
		// Double quotes, so the shell expands $TOKEN.
		expect(snippets.curl).toContain('-H "Authorization: Bearer $TOKEN"');
		expect(snippets.javascript).toContain("method: 'POST'");
		expect(snippets.python).toContain('requests.post(');
	});

	it('keeps header examples literal; only the auth token is a variable', () => {
		const operation = readOperation({
			operation: {
				protocol: 'rest',
				method: 'get',
				path: '/pets',
				auth: 'bearer',
				parameters: [{ name: 'If-None-Match', in: 'header', type: 'string', example: '"$v1"' }]
			}
		});
		if (operation?.protocol !== 'rest') throw new Error('expected a REST operation');
		const snippets = requestSnippets(operation, 'https://api.example.com', {});
		expect(snippets.curl).toContain(`-H 'If-None-Match: "$v1"'`);
		expect(snippets.javascript).toContain(`'If-None-Match': '"$v1"'`);
		expect(snippets.javascript).toContain("'Authorization': `Bearer ${TOKEN}`");
		expect(snippets.python).toContain(`"If-None-Match": "\\"$v1\\""`);
		expect(snippets.python).toContain('"Authorization": f"Bearer {TOKEN}"');
	});

	it('leaves placeholders for parameters without examples readable', () => {
		const operation = readOperation({
			operation: {
				protocol: 'rest',
				method: 'get',
				path: '/pets/{petId}',
				parameters: [
					{ name: 'petId', in: 'path', type: 'string' },
					{ name: 'limit', in: 'query', type: 'integer', required: true }
				]
			}
		});
		if (operation?.protocol !== 'rest') throw new Error('expected a REST operation');
		expect(requestSnippets(operation, 'https://api.example.com', {}).curl).toContain(
			"'https://api.example.com/pets/{petId}?limit={limit}'"
		);
	});

	it('encodes apostrophes in URL examples and keeps body strings intact in Python', () => {
		const operation = readOperation({
			operation: {
				protocol: 'rest',
				method: 'post',
				path: '/authors/{name}',
				parameters: [{ name: 'name', in: 'path', type: 'string', required: true, example: "O'Reilly" }],
				requestBody: { example: { note: 'true story', ok: true, gone: null } }
			}
		});
		if (operation?.protocol !== 'rest') throw new Error('expected a REST operation');
		const snippets = requestSnippets(operation, 'https://api.example.com', {});
		expect(snippets.curl).toContain("curl -X POST 'https://api.example.com/authors/O%27Reilly'");
		expect(snippets.javascript).toContain("fetch('https://api.example.com/authors/O%27Reilly'");
		expect(snippets.python).toContain('"note": "true story"');
		expect(snippets.python).toContain('"ok": True');
		expect(snippets.python).toContain('"gone": None');
	});
});

describe('graphqlQuery', () => {
	it('declares every argument as a variable when the note has no example query', () => {
		const operation = readOperation({
			operation: {
				protocol: 'graphql',
				kind: 'mutation',
				name: 'adoptPet',
				args: [
					{ name: 'petId', type: 'ID!', required: true },
					{ name: 'note', type: 'String' }
				]
			}
		});
		if (operation?.protocol !== 'graphql') throw new Error('expected a GraphQL operation');
		expect(graphqlQuery(operation)).toBe(
			'mutation ($petId: ID!, $note: String) {\n  adoptPet(petId: $petId, note: $note) {\n    id\n  }\n}'
		);
	});

	it('selects no fields from a scalar result', () => {
		const operation = readOperation({
			operation: { protocol: 'graphql', kind: 'mutation', name: 'deletePet', returns: 'Boolean!', args: [] }
		});
		if (operation?.protocol !== 'graphql') throw new Error('expected a GraphQL operation');
		expect(graphqlQuery(operation)).toBe('mutation {\n  deletePet\n}');
	});
});

describe('browser routes', () => {
	const allow = readOperation({
		operation: {
			method: 'post',
			path: '/oauth/authorize?/allow',
			client: 'browser',
			parameters: [{ name: 'session', in: 'cookie', example: '<browser-session>' }],
			requestBody: { contentType: 'application/x-www-form-urlencoded', example: { client_id: 'lgc_1', state: 'a"b&c' } },
			responses: { 303: { description: 'Back to the client.', headers: { Location: 'https://client.example/callback?code=c_1' } } }
		}
	});
	if (allow?.protocol !== 'rest') throw new Error('expected a REST operation');

	it('shows a form action as an escaped HTML form and the raw request it sends, joining the action query', () => {
		expect(browserSnippets(allow, 'https://relay.example', {})).toEqual({
			html: [
				'<form method="post" action="/oauth/authorize?/allow">',
				'  <input type="hidden" name="client_id" value="lgc_1" />',
				'  <input type="hidden" name="state" value="a&quot;b&amp;c" />',
				'  <button>Submit</button>',
				'</form>'
			].join('\n'),
			http: [
				'POST /oauth/authorize?/allow HTTP/1.1',
				'Host: relay.example',
				'Cookie: session=<browser-session>',
				'Content-Type: application/x-www-form-urlencoded',
				'',
				'client_id=lgc_1&state=a%22b%26c'
			].join('\n')
		});
	});

	it('shows a redirect as its status line and headers, with no invented body', () => {
		expect(responseTabs(allow.responses, {})).toEqual([
			{ id: '303', label: '303', code: 'HTTP/1.1 303 See Other\nLocation: https://client.example/callback?code=c_1' }
		]);
	});

	it('appends query parameters to a path that already has a query', () => {
		const signIn = readOperation({
			operation: { method: 'get', path: '/login?/next', parameters: [{ name: 'to', in: 'query', example: '/agents' }] }
		});
		if (signIn?.protocol !== 'rest') throw new Error('expected a REST operation');
		expect(requestSnippets(signIn, 'https://relay.example', {}).curl).toContain("'https://relay.example/login?/next&to=%2Fagents'");
	});
});

describe('WebSocket operations', () => {
	it('read the upgrade, messages by direction, and close codes', () => {
		const operation = readOperation({
			operation: {
				protocol: 'websocket',
				path: '/v1/stream',
				responses: { 101: { description: 'Switching Protocols' }, 429: { description: 'A sixth socket.' } },
				messages: [{ direction: 'receive', name: 'digest' }, { direction: 'sideways', name: 'lost' }],
				close: { 4003: 'The agent lost `messages:read`.' }
			}
		});
		expect(operation).toMatchObject({
			protocol: 'websocket',
			path: '/v1/stream',
			responses: [{ status: '101' }, { status: '429' }],
			messages: [{ direction: 'receive', name: 'digest' }],
			close: [{ code: '4003', description: 'The agent lost `messages:read`.' }]
		});
	});
});
