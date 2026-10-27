import { materializeTheme } from '@svartz/core';
import { extensions as api } from '@svartz/theme-api-docs/runtime';
import { choosePage, composeThemes, compositionOf } from '@svartz/theme-minimal/runtime';
import { describe, expect, it } from 'vitest';
import createRuntimeTheme, { extensions as mcp } from './runtime.js';

const page = (path: string, properties: Record<string, unknown>) => ({ path, slug: path.replace(/\.md$/, ''), properties });

describe('@svartz/theme-mcp-docs', () => {
	it("extends theme-minimal: minimal's layout and pages load for SSR, with the MCP and schema renderers", async () => {
		const runtime = createRuntimeTheme();
		const theme = await materializeTheme(runtime);
		for (const module of [...Object.values(theme.layouts), ...theme.routes.map((route) => route.component)].filter(Boolean)) {
			expect(module).toHaveProperty('default');
		}
		expect(compositionOf(runtime).primary.renderers?.map((renderer) => renderer.id)).toEqual(['mcp', 'schema']);
	});

	it('composes with the API theme into one site where each page picks its renderer, the shared schema renderer once', () => {
		const site = compositionOf(composeThemes([...api, ...mcp]));
		const kinds = [
			page('guides/start.md', {}),
			page('rest/get-pet.md', { operation: { method: 'GET', path: '/pets/{id}' } }),
			page('graphql/pet.md', { operation: { protocol: 'graphql', kind: 'query', name: 'pet' } }),
			page('mcp/get-pet.md', { operation: { protocol: 'mcp', kind: 'tool', name: 'get_pet', inputSchema: { type: 'object' } } }),
			page('schemas/pet.md', { model: { name: 'Pet', schema: { type: 'object' } } })
		].map((entry) => choosePage(site, entry)?.renderer?.id ?? 'guide');
		expect(kinds).toEqual(['guide', 'rest', 'graphql', 'mcp', 'schema']);
	});

	it("leaves an HTTP page on an MCP-only site as a plain note, and names the page when a tool's metadata is invalid", () => {
		const site = compositionOf(createRuntimeTheme());
		expect(choosePage(site, page('rest/get-pet.md', { operation: { method: 'GET', path: '/pets' } }))).toBeUndefined();
		expect(() => choosePage(site, page('mcp/broken.md', { operation: { protocol: 'mcp', kind: 'tool' } }))).toThrow(
			/"mcp\/broken\.md" can't render: the mcp renderer rejected its metadata/
		);
	});
});
