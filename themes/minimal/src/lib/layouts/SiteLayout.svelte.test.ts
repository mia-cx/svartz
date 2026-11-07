import { createVaultView, type Index, type IndexEntry, type ResolvedSiteConfig } from '@svartz/core';
import type { ThemePageProps } from '@svartz/ui';
import { createRawSnippet } from 'svelte';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import { composeThemes } from '../runtime.js';
import SiteLayout from './SiteLayout.svelte';

const PAGE = '[data-svartz-region="page-actions"]';
const SITE = '[data-svartz-region="site-actions"]';

const note = (slug: string): IndexEntry => ({
	slug,
	href: `/${slug}/`,
	path: `${slug}.md`,
	properties: {},
	page: { toc: false, comments: false },
	title: `The ${slug} note`,
	tags: [],
	aliases: [],
	content: '',
	links: [],
	toc: [],
	wordCount: 1,
	readingTimeMinutes: 1
});

const index: Index = {
	version: '1.0.0',
	entries: [note('plain'), { ...note('copied'), markdownHref: '/copied.md' }],
	graph: {},
	backlinks: {},
	search: [],
	tags: [],
	folders: [],
	routes: { mountPath: '', notes: ['/plain/', '/copied/'], redirects: {}, tags: [], folders: [], feed: [], theme: [], all: ['/plain/', '/copied/'] },
	assets: []
};
const vault = createVaultView(index, 'garden');
const body = createRawSnippet(() => ({ render: () => '<p>Body</p>' }));

function renderPage(slug?: string) {
	const entry = slug ? vault.entries.find((candidate) => candidate.slug === slug) : undefined;
	const props: ThemePageProps = {
		vault,
		entry,
		site: { title: 'Garden' } as ResolvedSiteConfig,
		match: entry
			? { route: { id: 'note', pattern: '/:slug' }, pathname: entry.href, params: { slug } }
			: { route: { id: 'tags-index', pattern: '/tags' }, pathname: '/tags/', params: {} },
		theme: composeThemes([]),
		children: body
	};
	return render(SiteLayout, props);
}

/** Mount what a plugin browser script mounts: a button in each region on the page. */
function mountActions() {
	const button = (label: string) => Object.assign(document.createElement('button'), { type: 'button', textContent: label });
	document.querySelector(PAGE)?.append(button('Edit'));
	document.querySelector(SITE)?.append(button('New page'));
}

it('gives a note one page-actions and one site-actions region, hidden while empty', async () => {
	renderPage('plain');
	await expect.element(page.getByRole('heading', { name: 'The plain note' })).toBeVisible();
	expect(document.querySelectorAll(PAGE)).toHaveLength(1);
	expect(document.querySelectorAll(SITE)).toHaveLength(1);
	// No Markdown copy and no plugin action: the row and both regions take no space.
	for (const selector of ['.sv-page-actions', SITE]) expect(document.querySelector<HTMLElement>(selector)!.checkVisibility(), selector).toBe(false);
});

it('shows mounted actions: Edit in the note header, New page above the explorer, in reading order', async () => {
	await page.viewport(1280, 900);
	renderPage('copied');
	await expect.element(page.getByRole('heading', { name: 'The copied note' })).toBeVisible();
	mountActions();

	const edit = page.getByRole('button', { name: 'Edit' });
	const create = page.getByRole('button', { name: 'New page' });
	await expect.element(edit).toBeVisible();
	await expect.element(create).toBeVisible();
	expect(edit.element().closest('.note-head')).not.toBeNull();
	expect(create.element().closest('#explorer-panel')).not.toBeNull();

	// Tab order: search, New page, the explorer, then the note's Copy page and Edit.
	const controls = [...document.querySelectorAll<HTMLElement>('a[href], button')].filter((control) => control.checkVisibility());
	const at = (name: string) => controls.findIndex((control) => control.textContent?.trim() === name);
	expect(at('New page')).toBeLessThan(at('The plain note'));
	expect(at('The plain note')).toBeLessThan(at('Copy page'));
	expect(at('Copy page')).toBeLessThan(at('Edit'));
});

it('puts site actions in the phone drawer', async () => {
	await page.viewport(390, 844);
	renderPage('plain');
	mountActions();
	expect(document.querySelector<HTMLElement>(`${SITE} > button`)!.checkVisibility({ visibilityProperty: true })).toBe(false);
	await page.getByRole('button', { name: 'Open the explorer' }).click();
	await expect.element(page.getByRole('button', { name: 'New page' })).toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
});

it('keeps site actions on list pages, which have no page actions', async () => {
	renderPage();
	expect(document.querySelectorAll(PAGE)).toHaveLength(0);
	expect(document.querySelectorAll(SITE)).toHaveLength(1);
});
