/**
 * Every theme on minimal's shell gets the home note's body marked, so plugins such as annotations attach to it, while
 * a generated home page and a protected home note stay unmarked. The themes render through the runtime's composed
 * layout and annotations mount through core's `mountBrowserScripts`. It lives in the wiki theme's browser project
 * because minimal can't depend on the themes that extend it.
 */
import { createVaultView, mountBrowserScripts, type Index, type IndexEntry, type ResolvedSiteConfig } from '@svartz/core';
import { HIGHLIGHT } from '@svartz/plugin-annotations/browser';
import { extensions as blog } from '@svartz/theme-blog/runtime';
import { extensions as docs } from '@svartz/theme-docs/runtime';
import { composeThemes, type ThemeExtension } from '@svartz/theme-minimal/runtime';
import type { ThemePageProps } from '@svartz/ui';
import { createRawSnippet, type Component } from 'svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { extensions as wiki } from './runtime.js';

const THEMES: Record<string, readonly ThemeExtension[]> = { minimal: [], wiki, docs, blog };
const ENDPOINT = '/_svartz/annotations';
const PASSAGE = 'Home passage';

const home = (properties: Record<string, unknown> = {}): IndexEntry => ({
	slug: 'index',
	href: '/',
	path: 'index.md',
	properties,
	page: { toc: false, comments: false },
	title: 'Lanternfall',
	tags: [],
	aliases: [],
	content: '',
	links: [],
	toc: [],
	wordCount: 3,
	readingTimeMinutes: 1
});

const vaultOf = (entries: IndexEntry[]) =>
	createVaultView(
		{
			version: '1.0.0',
			entries,
			graph: {},
			backlinks: {},
			search: [],
			tags: [],
			folders: [],
			routes: { mountPath: '', notes: entries.map((entry) => entry.href), redirects: {}, tags: [], folders: [], feed: [], theme: [], all: entries.map((entry) => entry.href) },
			assets: []
		} satisfies Index,
		'wiki'
	);

/** Render `/` with `extensions` composed onto minimal, showing `entry` as the home note, or the generated home page without one. */
function renderHome(extensions: readonly ThemeExtension[], entry?: IndexEntry) {
	const theme = composeThemes(extensions);
	const SiteLayout = (theme.layouts.notePage as { default: Component<ThemePageProps> }).default;
	return render(SiteLayout, {
		vault: vaultOf(entry ? [entry] : []),
		entry,
		site: { title: 'Lanternfall' } as ResolvedSiteConfig,
		match: { route: { id: 'home', pattern: '/' }, pathname: '/', params: {} },
		theme,
		children: createRawSnippet(() => ({ render: () => `<p>${PASSAGE}, kept by the home note.</p>` }))
	});
}

/** Mount annotations as the runtime does after a navigation, its stored comment on the home passage. */
async function mountAnnotations() {
	const comment = {
		kind: 'comment',
		id: 'home',
		body: 'Welcome.',
		anchor: { exact: PASSAGE, prefix: '', suffix: '', start: 0, end: PASSAGE.length },
		author: { id: 'github:1815', provider: 'github', name: 'Ada Lovelace' },
		createdAt: '2026-11-02T09:00:00.000Z',
		agreements: []
	};
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
		String(input).startsWith(`${ENDPOINT}/`) ? Response.json({ annotations: [comment] }) : new Response(null, { status: 404 })
	);
	dispose?.();
	dispose = await mountBrowserScripts([{ id: 'annotations', load: () => import('@svartz/plugin-annotations/browser'), options: { endpoint: ENDPOINT } }], '/');
}

let dispose: (() => void) | undefined;
const marked = () => [...document.querySelectorAll<HTMLElement>('[data-svartz-note]')].map((element) => element.dataset.svartzNote);
const highlighted = () => [...(CSS.highlights.get(HIGHLIGHT) ?? [])].map((range) => range.toString());

afterEach(() => {
	dispose?.();
	dispose = undefined;
	vi.unstubAllGlobals();
});

for (const [name, extensions] of Object.entries(THEMES)) {
	it(`marks the ${name} home note, and annotations show its comment`, async () => {
		renderHome(extensions, home());
		await expect.element(page.getByText(PASSAGE)).toBeVisible();
		expect(marked()).toEqual(['index']);

		await mountAnnotations();
		await expect.poll(highlighted).toEqual([PASSAGE]);
		expect(document.querySelectorAll('.sv-annotations-marker')).toHaveLength(1);
	});

	it(`leaves a generated ${name} home page and a protected home note unmarked`, async () => {
		const generated = renderHome(extensions);
		expect(marked()).toEqual([]);
		await mountAnnotations();
		expect(document.querySelector('.sv-annotations')).toBeNull();
		generated.unmount();

		renderHome(extensions, home({ password_group: 'friends' }));
		await expect.element(page.getByText(PASSAGE)).toBeVisible();
		expect(marked()).toEqual([]);
		await mountAnnotations();
		expect(document.querySelector('.sv-annotations')).toBeNull();
	});
}
