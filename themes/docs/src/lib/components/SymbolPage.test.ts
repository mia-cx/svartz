import type { RendererProps } from '@svartz/theme-minimal/runtime';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import { readSymbol, type DocSymbol } from '../symbols.js';
import SymbolPage from './SymbolPage.svelte';

const page = (raw: Record<string, unknown>) => {
	const data = readSymbol({ symbol: raw })!;
	// Only the shell fields the page reads.
	const shell = { vault: { entries: [] } } as unknown as RendererProps<DocSymbol>['shell'];
	const children = createRawSnippet(() => ({ render: () => '<p class="intro">Remarks</p>' }));
	const empty = createRawSnippet(() => ({ render: () => '<span></span>' }));
	return render(SymbolPage, {
		props: { shell, data, entry: {} as RendererProps<DocSymbol>['entry'], children, summary: empty, actions: empty, content: children }
	}).body;
};

it('heads the page with the kind and name, then the note, then the generated reference', () => {
	const body = page({
		kind: 'class',
		name: 'Vault',
		since: '1.0.0',
		signature: 'class Vault',
		parameters: [{ name: 'path', type: 'string' }],
		members: [{ name: 'load', kind: 'method' }]
	});
	const order = ['>class<', '>Vault</h1>', 'Since 1.0.0', 'Remarks', 'class Vault</code>', 'id="parameters"', 'id="members-method"'];
	const positions = order.map((text) => body.indexOf(text));
	expect(positions.every((position) => position >= 0)).toBe(true);
	expect(positions).toEqual([...positions].sort((left, right) => left - right));
});
