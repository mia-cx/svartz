import { materializeTheme } from '@svartz/core';
import { referencePage, referenceTheme, themeRegistry } from '@svartz/ui/reference/runtime';
import { apiRenderers } from '@svartz/theme-api-docs/runtime';
import { describe, expect, it } from 'vitest';
import createRuntimeTheme, { mcpRenderers } from './runtime.js';

const page = (path: string, properties: Record<string, unknown>) => ({ path, slug: path.replace(/\.md$/, ''), properties });

describe('@svartz/theme-mcp-docs', () => {
	it('loads every layout and route page for SSR, with the MCP and schema renderers', async () => {
		const theme = await materializeTheme(createRuntimeTheme());
		for (const module of [...Object.values(theme.layouts), ...theme.routes.map((route) => route.component)].filter(Boolean)) {
			expect(module).toHaveProperty('default');
		}
		expect([...themeRegistry(theme).keys()]).toEqual(['mcp', 'schema']);
	});

	it('composes with the API renderers into one theme that renders every kind of page', () => {
		const registry = themeRegistry(referenceTheme({ id: '@acme/docs', renderers: [...apiRenderers, ...mcpRenderers] }));
		const kinds = [
			page('guides/start.md', {}),
			page('rest/get-pet.md', { operation: { method: 'GET', path: '/pets/{id}' } }),
			page('graphql/pet.md', { operation: { protocol: 'graphql', kind: 'query', name: 'pet' } }),
			page('mcp/get-pet.md', { operation: { protocol: 'mcp', name: 'get_pet' } }),
			page('schemas/pet.md', { model: { name: 'Pet', schema: { type: 'object' } } })
		].map((entry) => referencePage(registry, entry)?.renderer.id ?? 'guide');
		expect(kinds).toEqual(['guide', 'rest', 'graphql', 'mcp', 'schema']);
	});

	it('tells an MCP-only site which renderer an HTTP page needs', () => {
		const registry = themeRegistry(createRuntimeTheme());
		expect(() => referencePage(registry, page('rest/get-pet.md', { operation: { method: 'GET', path: '/pets' } }))).toThrow(
			'"rest/get-pet.md" can\'t render: no renderer handles `operation.protocol: rest`. This theme renders mcp, schema.'
		);
	});
});
