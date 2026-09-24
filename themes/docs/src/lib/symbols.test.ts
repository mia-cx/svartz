import { describe, expect, it } from 'vitest';
import { groupByKind, readSymbol, symbolNav, symbolToc } from './symbols.js';

describe('readSymbol', () => {
	it('reads a full symbol and normalises signatures to a list', () => {
		const symbol = readSymbol({
			symbol: {
				kind: 'function',
				name: 'defineTheme',
				signature: 'defineTheme(factory: ThemeFactory): ThemeFactory',
				typeParameters: [{ name: 'T', constraint: 'SvartzTheme' }],
				parameters: [{ name: 'factory', type: '[[ThemeFactory]]', description: 'Builds the theme.' }],
				returns: { type: 'ThemeFactory', description: 'The same factory, validated.' },
				throws: [{ type: 'ThemeValidationError', description: 'When the theme is invalid.' }],
				source: 'https://github.com/mia-cx/svartz/blob/main/packages/core/src/theme/define-theme.ts',
				since: '1.0.0'
			}
		});
		expect(symbol).toMatchObject({
			kind: 'function',
			name: 'defineTheme',
			signatures: ['defineTheme(factory: ThemeFactory): ThemeFactory'],
			parameters: [{ name: 'factory', type: '[[ThemeFactory]]', optional: false }],
			returns: { type: 'ThemeFactory' },
			since: '1.0.0'
		});
	});

	it('accepts overloads, members, and a deprecation note', () => {
		const symbol = readSymbol({
			symbol: {
				kind: 'class',
				name: 'Vault',
				signatures: ['new Vault(path: string)', 'new Vault(config: VaultConfig)'],
				extends: ['[[Base]]'],
				members: [
					{ name: 'load', kind: 'method', signature: 'load(): Promise<void>' },
					{ name: 'path', kind: 'property', signature: 'path: string', static: true }
				],
				deprecated: 'Use [[VaultView]].'
			}
		});
		expect(symbol?.signatures).toHaveLength(2);
		expect(symbol?.members.map((member) => member.kind)).toEqual(['method', 'property']);
		expect(symbol?.deprecated).toBe('Use [[VaultView]].');
	});

	it('rejects unknown kinds and missing names', () => {
		expect(readSymbol({ symbol: { kind: 'widget', name: 'x' } })).toBeUndefined();
		expect(readSymbol({ symbol: { kind: 'function' } })).toBeUndefined();
		expect(readSymbol({})).toBeUndefined();
	});
});

describe('symbolToc', () => {
	it('lists generated sections around the note’s own headings, in page order', () => {
		const symbol = readSymbol({
			symbol: {
				kind: 'class',
				name: 'Vault',
				parameters: [{ name: 'path' }],
				extends: ['Base'],
				members: [{ name: 'load', kind: 'method' }]
			}
		})!;
		const toc = symbolToc(symbol, [{ depth: 2, text: 'Examples', slug: 'examples' }]);
		expect(toc.map((item) => item.slug)).toEqual(['parameters', 'examples', 'hierarchy', 'members-method']);
	});
});

describe('grouping', () => {
	const entry = (slug: string, kind?: string) => ({
		slug,
		title: slug.split('/').at(-1)!,
		href: `/${slug}/`,
		properties: kind ? { symbol: { kind, name: slug.split('/').at(-1) } } : {}
	});

	it('groups a module’s symbols by kind in reference order', () => {
		const groups = groupByKind([entry('core/b', 'function'), entry('core/A', 'class'), entry('core/a', 'function'), entry('core/guide')]);
		expect(groups.map((group) => [group.kind, group.entries.map((item) => item.title)])).toEqual([
			['class', ['A']],
			['function', ['a', 'b']]
		]);
	});

	it('builds sidebar sections: guides first, then one section per module', () => {
		const nav = symbolNav([
			entry('index'),
			entry('guides/start'),
			entry('core/defineTheme', 'function'),
			entry('core/SvartzTheme', 'interface'),
			entry('vite/withSvartzHost', 'function')
		], [
			{ slug: 'guides', title: 'Guides', href: '/folders/guides/' },
			{ slug: 'core', title: 'core', href: '/folders/core/' },
			{ slug: 'vite', title: 'vite', href: '/folders/vite/' }
		]);
		expect(nav.map((section) => [section.title, section.symbols, section.entries.length])).toEqual([
			['Guides', false, 1],
			['core', true, 2],
			['vite', true, 1]
		]);
	});

	it('names and links a module with its folder note, and keeps its guides', () => {
		const nav = symbolNav(
			[{ ...entry('core'), title: 'Core API' }, entry('core/defineTheme', 'function'), entry('core/migration')],
			[{ slug: 'core', title: 'core', href: '/folders/core/' }]
		);
		expect(nav.map((section) => [section.title, section.href, section.pages.map((page) => page.title)])).toEqual([
			['Core API', '/core/', ['migration']]
		]);
	});
});
