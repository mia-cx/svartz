import { createVaultView, type Index, type IndexEntry, type ResolvedSiteConfig } from '@svartz/core';
import { composeThemes } from '@svartz/theme-minimal/runtime';
import type { ThemePageProps } from '@svartz/ui';
import { createRawSnippet, type Component } from 'svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import { extensions } from '../runtime.js';

const PAGE = '[data-svartz-region="page-actions"]';
const SITE = '[data-svartz-region="site-actions"]';

const note = (slug: string, properties: Record<string, unknown> = {}): IndexEntry => ({
	slug,
	href: `/${slug}/`,
	path: `${slug}.md`,
	properties,
	page: { toc: false, comments: false },
	title: `The ${slug} page`,
	tags: [],
	aliases: [],
	content: '',
	links: [],
	toc: [],
	wordCount: 1,
	readingTimeMinutes: 1,
	markdownHref: `/${slug}.md`
});

const index: Index = {
	version: '1.0.0',
	entries: [note('plain'), note('article', { hatnote: 'Not to be confused with the plain page.' })],
	graph: {},
	backlinks: {},
	search: [],
	tags: [],
	folders: [],
	routes: { mountPath: '', notes: ['/plain/', '/article/'], redirects: {}, tags: [], folders: [], feed: [], theme: [], all: ['/plain/', '/article/'] },
	assets: []
};
const vault = createVaultView(index, 'wiki');
const theme = composeThemes(extensions);
const SiteLayout = (theme.layouts.notePage as { default: Component<ThemePageProps> }).default;

function renderPage(slug: string) {
	const entry = vault.entries.find((candidate) => candidate.slug === slug)!;
	render(SiteLayout, {
		vault,
		entry,
		site: { title: 'Lanternfall' } as ResolvedSiteConfig,
		match: { route: { id: 'note', pattern: '/:slug' }, pathname: entry.href, params: { slug } },
		theme,
		children: createRawSnippet(() => ({ render: () => '<p>Body</p>' }))
	});
}

function mountActions() {
	const button = (label: string) => Object.assign(document.createElement('button'), { type: 'button', textContent: label });
	document.querySelector(PAGE)?.append(button('Edit'));
	document.querySelector(SITE)?.append(button('New page'));
}

const top = (element: Element) => element.getBoundingClientRect().top;

for (const slug of ['plain', 'article']) {
	it(`puts Edit beside the title and New page under Random page on a ${slug} note`, async () => {
		await page.viewport(1280, 900);
		renderPage(slug);
		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(document.querySelectorAll(PAGE)).toHaveLength(1);
		expect(document.querySelectorAll(SITE)).toHaveLength(1);
		expect(document.querySelector<HTMLElement>(SITE)!.checkVisibility()).toBe(false);
		mountActions();

		const edit = page.getByRole('button', { name: 'Edit' });
		const create = page.getByRole('button', { name: 'New page' });
		await expect.element(edit).toBeVisible();
		await expect.element(create).toBeVisible();

		// Beside the title: on its row, to its right.
		const title = page.getByRole('heading', { level: 1 }).element();
		expect(edit.element().closest('.title-row')).toBe(title.parentElement);
		expect(edit.element().getBoundingClientRect().left).toBeGreaterThan(title.getBoundingClientRect().right);
		expect(top(edit.element())).toBeLessThan(title.getBoundingClientRect().bottom);

		// Under Random page, in the rail's navigation.
		const random = page.getByRole('button', { name: 'Random page' }).element();
		expect(create.element().closest('nav')).toBe(random.closest('nav'));
		expect(top(create.element())).toBeGreaterThan(top(random));
	});
}

it('reaches New page in the phone drawer, after Random page', async () => {
	await page.viewport(390, 844);
	renderPage('plain');
	mountActions();
	await page.getByRole('button', { name: 'Open the menu' }).click();
	await expect.element(page.getByRole('button', { name: 'New page' })).toBeVisible();

	const controls = [...document.querySelectorAll<HTMLElement>('#explorer-panel :is(a[href], button)')].filter((control) => control.checkVisibility({ visibilityProperty: true }));
	const names = controls.map((control) => control.textContent?.trim());
	expect(names.indexOf('New page')).toBe(names.indexOf('Random page') + 1);
	await expect.element(page.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
});
