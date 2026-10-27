import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readOperation, requestSnippets, type RestOperation } from './api.js';

// Each generated snippet runs for real against this server, so a snippet that
// parses a 204 as JSON or posts JSON to a form endpoint fails here.
const run = promisify(execFile);
const TOKEN = 'secret';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const readBody = async (request: IncomingMessage) => {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8');
};

let server: Server;
let origin: string;
let scratch: string;

beforeAll(async () => {
	server = createServer(async (request, response) => {
		const url = new URL(request.url!, 'http://localhost');
		const body = await readBody(request);
		const type = request.headers['content-type'] ?? '';
		const json = (status: number, value: unknown) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
		if (url.pathname === '/internal') {
			return request.headers.authorization === 'Bot abc' ? json(200, { ok: true }) : json(401, { auth: request.headers.authorization });
		}
		if (url.pathname !== '/auth.md' && request.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: 'unauthorized' });
		switch (`${request.method} ${url.pathname}`) {
			case 'GET /pets/p_1':
				return json(200, { id: 'p_1' });
			case 'GET /auth.md':
				return response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' }).end('# Auth\n');
			case 'GET /avatar':
				return response.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
			case 'DELETE /delivery':
				return response.writeHead(204).end();
			case 'POST /mcp':
				return JSON.parse(body).id === undefined ? response.writeHead(202).end() : json(400, { error: 'expected a notification' });
			case 'POST /oauth2/token':
				return type.startsWith('application/x-www-form-urlencoded')
					? json(200, { received: Object.fromEntries(new URLSearchParams(body)) })
					: json(415, { type });
			case 'POST /photos':
				return type.startsWith('multipart/form-data; boundary=') && /name="title"\r\n\r\nBiscuit\r\n/.test(body)
					? json(201, { tags: body.match(/name="tags"/g)?.length })
					: json(415, { type });
			case 'GET /maybe':
				return url.searchParams.get('empty') === '1' ? response.writeHead(204).end() : json(200, { full: true });
			case 'POST /echo':
				return response.writeHead(200, { 'content-type': 'text/plain' }).end(body);
			case 'GET /authorize':
				return response.writeHead(302, { location: '/callback?code=c_1' }).end();
		}
		json(404, { path: url.pathname });
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	scratch = mkdtempSync(join(tmpdir(), 'svartz-snippets-'));
});

afterAll(() => {
	server.close();
	rmSync(scratch, { recursive: true, force: true });
});

const python = (() => {
	try {
		execFileSync('python3', ['-c', 'import requests']);
		return true;
	} catch {
		return false;
	}
})();

const operation = (metadata: Record<string, unknown>) => {
	const parsed = readOperation({ operation: { auth: 'bearer', ...metadata } });
	if (parsed?.protocol !== 'rest') throw new Error('expected a REST operation');
	return parsed;
};

/** Runs one language's snippet and prints `result`, an expression over the snippet's variables. */
async function runSnippet(language: 'javascript' | 'python', op: RestOperation, result: string) {
	const snippet = requestSnippets(op, origin, {})[language];
	if (language === 'javascript') {
		const file = join(scratch, `snippet-${Math.random().toString(36).slice(2)}.mjs`);
		writeFileSync(file, `const TOKEN = '${TOKEN}';\n${snippet}\nconsole.log(JSON.stringify(${result}));\n`);
		return JSON.parse((await run('node', [file])).stdout);
	}
	const script = `import json\nTOKEN = "${TOKEN}"\n${snippet}\nprint(json.dumps(${result}))\n`;
	return JSON.parse((await run('python3', ['-c', script])).stdout);
}

/** Runs the curl snippet in the scratch directory and returns what it printed. */
async function runCurl(op: RestOperation) {
	const { stdout } = await run('sh', ['-c', requestSnippets(op, origin, {}).curl], { cwd: scratch, env: { ...process.env, TOKEN } });
	return stdout;
}

const CASES: { name: string; op: () => RestOperation; javascript: string; python: string; expected: unknown; curl?: (output: string) => void }[] = [
	{
		name: 'a JSON body',
		op: () => operation({ method: 'get', path: '/pets/p_1', responses: { 200: { schema: { type: 'object' } } } }),
		javascript: 'data',
		python: 'data',
		expected: { id: 'p_1' },
		curl: (output) => expect(JSON.parse(output)).toEqual({ id: 'p_1' })
	},
	{
		name: 'a Markdown body, as text',
		op: () => operation({ method: 'get', path: '/auth.md', auth: 'none', responses: { 200: { contentType: 'text/markdown' } } }),
		javascript: 'text',
		python: 'text',
		expected: '# Auth\n',
		curl: (output) => expect(output).toBe('# Auth\n')
	},
	{
		name: 'an image, as bytes',
		op: () => operation({ method: 'get', path: '/avatar', responses: { 200: { contentType: 'image/png' } } }),
		javascript: 'blob.size',
		python: 'len(content)',
		expected: PNG.length,
		curl: () => expect(statSync(join(scratch, 'response.png')).size).toBe(PNG.length)
	},
	{
		name: 'a 204 with no body',
		op: () => operation({ method: 'delete', path: '/delivery', responses: { 204: { description: 'No content.' } } }),
		javascript: 'response.status',
		python: 'response.status_code',
		expected: 204,
		curl: (output) => expect(output).toBe('')
	},
	{
		name: 'an empty 202 after a JSON notification',
		op: () =>
			operation({
				method: 'post',
				path: '/mcp',
				requestBody: { example: { jsonrpc: '2.0', method: 'notifications/initialized' } },
				responses: { 202: { empty: true } }
			}),
		javascript: 'response.status',
		python: 'response.status_code',
		expected: 202,
		curl: (output) => expect(output).toBe('')
	},
	{
		name: 'a form-encoded request',
		op: () =>
			operation({
				method: 'post',
				path: '/oauth2/token',
				requestBody: { contentType: 'application/x-www-form-urlencoded', example: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: "a'b&c" } },
				responses: { 200: { schema: { type: 'object' } } }
			}),
		javascript: 'data.received',
		python: 'data["received"]',
		expected: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: "a'b&c" },
		curl: (output) => expect(JSON.parse(output).received.assertion).toBe("a'b&c")
	},
	{
		name: 'a multipart request with a repeated field',
		op: () =>
			operation({
				method: 'post',
				path: '/photos',
				requestBody: { contentType: 'multipart/form-data', example: { title: 'Biscuit', tags: ['dog', 'good'] } },
				responses: { 201: { schema: { type: 'object' } } }
			}),
		javascript: 'data.tags',
		python: 'data["tags"]',
		expected: 2,
		curl: (output) => expect(JSON.parse(output).tags).toBe(2)
	},
	...['1', '0'].map((empty) => ({
		name: `a 200 or 204 operation answering ${empty === '1' ? '204' : '200'}`,
		op: () =>
			operation({
				method: 'get',
				path: '/maybe',
				parameters: [{ name: 'empty', in: 'query', type: 'string', example: empty }],
				responses: { 200: { schema: { type: 'object' } }, 204: { description: 'Nothing new.' } }
			}),
		javascript: 'data',
		python: 'data',
		expected: empty === '1' ? null : { full: true }
	})),
	{
		name: 'a 2XX range answering 204',
		op: () =>
			operation({
				method: 'get',
				path: '/maybe',
				parameters: [{ name: 'empty', in: 'query', type: 'string', example: '1' }],
				responses: { '2XX': { contentType: 'application/json' } }
			}),
		javascript: 'data',
		python: 'data',
		expected: null
	},
	{
		name: 'a text body starting with @, sent as written',
		op: () =>
			operation({
				method: 'post',
				path: '/echo',
				requestBody: { contentType: 'text/plain', example: '@hello' },
				responses: { 200: { contentType: 'text/plain' } }
			}),
		javascript: 'text',
		python: 'text',
		expected: '@hello',
		curl: (output) => expect(output).toBe('@hello')
	},
	{
		name: 'a redirect, reading Location',
		op: () => operation({ method: 'get', path: '/authorize', responses: { 302: { description: 'To the callback.' } } }),
		javascript: 'location',
		python: 'location',
		expected: '/callback?code=c_1',
		curl: (output) => expect(output).toMatch(/^location: \/callback\?code=c_1\r?$/im)
	},
	{
		name: 'a custom scheme sent as a header parameter, with no bearer guess',
		op: () =>
			operation({
				method: 'get',
				path: '/internal',
				auth: { scheme: 'Bot', description: 'A bot token.' },
				parameters: [{ name: 'Authorization', in: 'header', type: 'string', example: 'Bot abc' }],
				responses: { 200: { schema: { type: 'object' } } }
			}),
		javascript: 'data',
		python: 'data',
		expected: { ok: true },
		curl: (output) => expect(JSON.parse(output)).toEqual({ ok: true })
	}
];

describe.each(CASES)('generated requests handle $name', ({ op, javascript, python: pythonResult, expected, curl }) => {
	it('in JavaScript', async () => {
		expect(await runSnippet('javascript', op(), javascript)).toEqual(expected);
	});

	it.skipIf(!python)('in Python', async () => {
		expect(await runSnippet('python', op(), pythonResult)).toEqual(expected);
	});

	it.skipIf(!curl)('in curl', async () => {
		curl!(await runCurl(op()));
	});
});

it('sends the JSON body of a JSON endpoint unchanged', () => {
	const snippets = requestSnippets(
		operation({ method: 'post', path: '/pets', requestBody: { example: { name: "Biscuit's" } }, responses: { 201: { schema: { type: 'object' } } } }),
		'https://api.example.com',
		{}
	);
	expect(snippets.curl).toContain(`-H 'Content-Type: application/json'`);
	expect(snippets.curl).toContain(`-d '{\n    "name": "Biscuit'\\''s"\n  }'`);
	expect(snippets.javascript).toContain('body: JSON.stringify({');
	expect(snippets.python).toContain('json={');
});

it('uses the operation server over the theme base URL', () => {
	const op = operation({ method: 'get', path: '/v1/stats', server: 'https://relay.example.com/', responses: { 200: { schema: { type: 'object' } } } });
	expect(requestSnippets(op, 'https://api.example.com', {}).curl).toContain("'https://relay.example.com/v1/stats'");
});

it('reads a body nobody described as text, never as JSON', () => {
	const snippets = requestSnippets(operation({ method: 'get', path: '/x', responses: { 200: { description: 'Something.' } } }), 'https://api.example.com', {});
	expect(snippets.javascript).toContain('const text = await response.text();');
	expect(snippets.python).toContain('text = response.text');
});
