import type { RendererProps } from '@svartz/theme-minimal/runtime';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import { readSymbol, type DocSymbol } from '../symbols.js';
import SymbolPage from './SymbolPage.svelte';

const page = (raw: Record<string, unknown>, entries: readonly { slug: string; title: string; href: string }[] = []) => {
	const data = readSymbol({ symbol: raw })!;
	// Only the shell fields the page reads.
	const shell = { vault: { entries } } as unknown as RendererProps<DocSymbol>['shell'];
	const children = createRawSnippet(() => ({ render: () => '<p class="intro">Remarks</p>' }));
	const empty = createRawSnippet(() => ({ render: () => '<span></span>' }));
	return render(SymbolPage, {
		props: { shell, data, entry: {} as RendererProps<DocSymbol>['entry'], children, summary: empty, actions: empty, content: children }
	}).body.replace(/<!--[^>]*-->/g, ''); // Hydration markers split text the reader sees as one run.
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

it('renders a class with a constructor', () => {
	const body = page({ kind: 'class', name: 'Vault', members: [{ name: 'constructor', kind: 'constructor', signature: 'new Vault()' }] });
	expect(body).toContain('id="members-constructor"');
});

it('links symbols named in signatures and shows a member default', () => {
	const body = page(
		{
			kind: 'interface',
			name: 'Options',
			signature: 'interface Options extends [[api/Base|Base]]',
			members: [{ name: 'mode', kind: 'property', signature: 'mode?: [[api/Mode|Mode]]', default: '`"light"`' }]
		},
		[
			{ slug: 'api/base', title: 'Base', href: '/api/base/' },
			{ slug: 'api/mode', title: 'Mode', href: '/api/mode/' }
		]
	);
	expect(body).toMatch(/interface Options extends <a href="\/api\/base\/"[^>]*>Base<\/a>/);
	expect(body).toMatch(/mode\?: <a href="\/api\/mode\/"[^>]*>Mode<\/a>/);
	expect(body).toMatch(/Default: <code[^>]*>"light"<\/code>/);
});
