import { buildExplorerTree } from '@svartz/ui';
import { describe, expect, it } from 'vitest';
import { groupByKind, moduleSections, readSymbol, symbolExplorerItem, symbolToc } from './symbols.js';

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
	it('lists the note’s own headings, then the generated sections, in page order', () => {
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
		expect(toc.map((item) => item.slug)).toEqual(['examples', 'parameters', 'hierarchy', 'members-method']);
	});
});

describe('symbolExplorerItem', () => {
	const item = (kind: string, name: string) => symbolExplorerItem(readSymbol({ symbol: { kind, name } })!);

	it('shows the kind as a badge beside the symbol name', () => {
		expect(item('interface', 'SvartzTheme')).toMatchObject({ badge: { label: 'INTERFACE', hue: 'teal' }, label: 'SvartzTheme' });
	});

	it('lists a folder’s symbols by kind in reference order, then its guides', () => {
		const note = (name: string, kind?: string) => ({
			slug: `core/${name}`,
			title: name,
			href: `/core/${name}/`,
			properties: kind ? { symbol: { kind, name } } : {}
		});
		const entries = [note('Alpha guide'), note('zeta', 'function'), note('Beta', 'class'), note('alpha', 'function')];
		const folders = [{ slug: 'core', title: 'Core', noteCount: 4, noteSlugs: entries.map((entry) => entry.slug), href: '/folders/core/' }];
		const [core] = buildExplorerTree(entries, folders, (entry) => {
			const symbol = readSymbol(entry.properties);
			return symbol && symbolExplorerItem(symbol);
		});
		expect(core!.children.map((node) => node.item?.label ?? node.title)).toEqual(['Beta', 'alpha', 'zeta', 'Alpha guide']);
	});
});

describe('grouping', () => {
	const entry = (slug: string, kind?: string) => ({
		slug,
		title: slug.split('/').at(-1)!,
		path: `${slug}.md`,
		href: `/${slug}/`,
		properties: kind ? { symbol: { kind, name: slug.split('/').at(-1) } } : {}
	});
	/** `folder/index.md`; its title is also the folder's, as the index records it. */
	const folderNote = (folder: string, title: string) => ({ ...entry(folder), title, path: `${folder}/index.md` });
	/** The index's folders, each listing the entries whose files sit inside it. */
	const foldersOf = (entries: readonly { slug: string; path: string }[], ...folders: [slug: string, title: string][]) =>
		folders.map(([slug, title]) => ({
			slug,
			title,
			href: `/folders/${slug}/`,
			noteSlugs: entries.filter((item) => item.path.startsWith(`${slug}/`)).map((item) => item.slug),
			noteSlug: entries.find((item) => item.path === `${slug}/index.md`)?.slug
		}));

	it('groups a module’s symbols by kind in reference order', () => {
		const groups = groupByKind([entry('core/b', 'function'), entry('core/A', 'class'), entry('core/a', 'function'), entry('core/guide')]);
		expect(groups.map((group) => [group.kind, group.entries.map((item) => item.title)])).toEqual([
			['class', ['A']],
			['function', ['a', 'b']]
		]);
	});

	it('builds home sections: guides first, then one section per module', () => {
		const entries = [
			entry('index'),
			entry('guides/start'),
			entry('core/defineTheme', 'function'),
			entry('core/SvartzTheme', 'interface'),
			entry('vite/withSvartzHost', 'function')
		];
		const sections = moduleSections(entries, foldersOf(entries, ['guides', 'Guides'], ['core', 'core'], ['vite', 'vite']));
		expect(sections.map((section) => [section.title, section.symbols, section.entries.length])).toEqual([
			['Guides', false, 1],
			['core', true, 2],
			['vite', true, 1]
		]);
	});

	it('sorts the root section first even when a folder note is titled Overview', () => {
		const entries = [folderNote('guides', 'Overview'), entry('guides/start'), entry('about')];
		const sections = moduleSections(entries, foldersOf(entries, ['guides', 'Overview']));
		expect(sections.map((section) => [section.slug, section.title])).toEqual([
			['', 'Overview'],
			['guides', 'Overview']
		]);
	});

	it('names and links a module with its folder note, which it doesn’t count', () => {
		const entries = [folderNote('core', 'Core API'), entry('core/defineTheme', 'function'), entry('core/migration')];
		const sections = moduleSections(entries, foldersOf(entries, ['core', 'Core API']));
		expect(sections.map((section) => [section.title, section.href, section.entries.map((page) => page.title)])).toEqual([
			['Core API', '/core/', ['defineTheme', 'migration']]
		]);
	});
});
