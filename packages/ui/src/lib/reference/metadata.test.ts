import { describe, expect, it } from 'vitest';
import { readAuth, readSources } from './metadata.js';

describe('readSources', () => {
	it('labels repository file links by path and line, and keeps authored labels', () => {
		expect(
			readSources({
				source: [
					'https://github.com/logitland/logitland/blob/main/packages/relay/src/mcp/logan-tools.ts#L23',
					'https://gitlab.com/acme/api/-/blob/v2/src/routes.ts#L10-L42',
					{ label: 'OpenAPI spec', href: 'https://api.example.com/openapi.json' },
					'https://docs.example.com/limits'
				]
			})
		).toEqual([
			{ label: 'packages/relay/src/mcp/logan-tools.ts:23', href: 'https://github.com/logitland/logitland/blob/main/packages/relay/src/mcp/logan-tools.ts#L23' },
			{ label: 'src/routes.ts:10–42', href: 'https://gitlab.com/acme/api/-/blob/v2/src/routes.ts#L10-L42' },
			{ label: 'OpenAPI spec', href: 'https://api.example.com/openapi.json' },
			{ label: 'docs.example.com/limits', href: 'https://docs.example.com/limits' }
		]);
		expect(readSources({ source: 'src/server.ts' })).toEqual([{ label: 'src/server.ts', href: 'src/server.ts' }]);
	});
});

describe('readAuth', () => {
	it('reads a bare scheme or a scheme with what to send and which scopes', () => {
		expect(readAuth('bearer')).toEqual({ scheme: 'bearer', scopes: [] });
		expect(readAuth({ scheme: 'bearer', description: "A person's `lla_` token", scopes: ['logan'] })).toEqual({
			scheme: 'bearer',
			description: "A person's `lla_` token",
			scopes: ['logan']
		});
		expect(readAuth({})).toBeUndefined();
	});
});
