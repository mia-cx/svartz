import { expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import type { ReferenceContext } from '@svartz/ui/reference/runtime';
import McpToolPage from './McpToolPage.svelte';
import { readMcpTool } from './mcp.js';

const page = (inputSchema: unknown) => {
	const tool = readMcpTool({ operation: { protocol: 'mcp', kind: 'tool', name: 'search', inputSchema } });
	if (!tool) throw new Error('fixture tool must parse');
	// Only the fields the page reads.
	const context = {
		entry: { title: 'Search' },
		vault: { entries: [] },
		themeConfig: {},
		schemas: {},
		schemaHref: () => undefined
	} as unknown as ReferenceContext;
	const children = createRawSnippet(() => ({ render: () => '<p></p>' }));
	return render(McpToolPage, { props: { data: tool, context, children } }).body;
};

it('documents a map-shaped input instead of saying the tool takes no arguments', () => {
	const body = page({ type: 'object', additionalProperties: { type: 'string' } });
	expect(body).not.toContain('Takes no arguments');
	expect(body).toContain('[key: string]');
});

it('says so when the input schema declares nothing', () => {
	expect(page({ type: 'object' })).toContain('Takes no arguments');
});
