import { describe, expect, it } from 'vitest';
import type { PageRenderer, ThemeExtension } from './extension.js';
import { choosePage, folderTheme, ThemeSelectionError, type Composition } from './select.js';

const component = (() => null) as unknown as PageRenderer['body'];
const renderer = (id: string, key: string): PageRenderer => ({
	id,
	detect: (properties) => (properties[key] === undefined ? undefined : { [key]: properties[key] }),
	body: component
});

const operation = renderer('rest', 'operation');
const model = renderer('schema', 'model');
const infobox = renderer('infobox', 'infobox');
const minimal: ThemeExtension = { id: '@svartz/theme-minimal' };
const api: ThemeExtension = { id: '@svartz/theme-api-docs', renderers: [model, operation] };
const mcp: ThemeExtension = { id: '@svartz/theme-mcp-docs', renderers: [model, renderer('mcp', 'tool')] };
const wiki: ThemeExtension = { id: '@svartz/theme-wiki', renderers: [infobox] };
const site: Composition = { primary: minimal, extensions: [minimal, api, mcp, wiki] };

const page = (path: string, properties: Record<string, unknown> = {}) => ({ path, slug: path.replace(/\.md$/, ''), properties });

describe('choosePage', () => {
	it('lets each theme detect its own pages, and leaves the rest as plain notes', () => {
		expect(choosePage(site, page('reference/post-token.md', { operation: { method: 'POST' } }))).toMatchObject({ theme: api, renderer: operation });
		expect(choosePage(site, page('wiki/rome.md', { infobox: { founded: '753 BC' } }))).toMatchObject({ theme: wiki, renderer: infobox });
		expect(choosePage(site, page('guides/start.md', { title: 'Start' }))).toBeUndefined();
	});

	it('treats one renderer shared by two themes as one claim', () => {
		expect(choosePage(site, page('schemas/Pet.md', { model: { name: 'Pet' } }))).toMatchObject({ renderer: model });
	});

	it("lets the page's `theme:` win, by short name or package name, and only that theme's renderers detect", () => {
		const both = { infobox: {}, operation: {} };
		expect(choosePage(site, page('a.md', { ...both, theme: 'wiki' }))).toMatchObject({ theme: wiki, renderer: infobox });
		expect(choosePage(site, page('a.md', { ...both, theme: '@svartz/theme-api-docs' }))).toMatchObject({ theme: api, renderer: operation });
	});

	it("renders a plain note in a named theme's style when none of its renderers claim it", () => {
		expect(choosePage(site, page('notes/a.md', { theme: 'wiki' }))).toEqual({ theme: wiki });
		expect(choosePage(site, page('notes/a.md', { theme: 'minimal' }))).toBeUndefined();
	});

	it("takes the nearest folder note's `theme:` when the page has none", () => {
		const folders = [page('wiki/cities/index.md'), page('wiki/index.md', { theme: 'wiki' })];
		expect(choosePage(site, page('wiki/cities/rome.md'), folders)).toEqual({ theme: wiki });
		expect(choosePage(site, page('wiki/cities/rome.md', { theme: 'minimal' }), folders)).toBeUndefined();
	});

	it('fails with the page path on a conflict, an unknown theme, or rejected metadata', () => {
		const conflict = () => choosePage(site, page('a.md', { infobox: {}, operation: {} }));
		expect(conflict).toThrow(ThemeSelectionError);
		expect(conflict).toThrow(/"a\.md".*rest \(@svartz\/theme-api-docs\) and infobox \(@svartz\/theme-wiki\).*`theme:`/);
		expect(() => choosePage(site, page('a.md'), [page('blog/index.md', { theme: 'blog' })])).toThrow(
			/"a\.md".*folder note's \(blog\/index\.md\) `theme: blog` isn't one of this site's themes \(minimal, api-docs, mcp-docs, wiki\)/
		);
		const strict: ThemeExtension = { id: 'strict', renderers: [{ id: 'strict', detect: () => { throw new Error('no path'); }, body: component }] };
		expect(() => choosePage({ primary: minimal, extensions: [minimal, strict] }, page('b.md'))).toThrow(/"b\.md".*strict renderer rejected its metadata: no path/);
	});
});

describe('folderTheme', () => {
	it("lists a folder with its folder note's theme, else its ancestors', else the primary theme", () => {
		expect(folderTheme(site, [page('wiki/cities/index.md'), page('wiki/index.md', { theme: 'wiki' })])).toBe(wiki);
		expect(folderTheme(site, [page('guides/index.md')])).toBe(minimal);
		expect(() => folderTheme(site, [page('x/index.md', { theme: 'nope' })])).toThrow(/"x\/index\.md" names `theme: nope`/);
	});
});
