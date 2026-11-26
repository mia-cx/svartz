/**
 * The section bar shows as many sections as its width allows and keeps the rest in More, which marks the current
 * section while it waits there.
 */
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import type { MenuFolder } from '../wiki.js';
import SectionBar from './SectionBar.svelte';

const folder = (title: string): MenuFolder => ({
	id: title.toLowerCase(),
	title,
	href: `/${title.toLowerCase()}/`,
	allHref: `/folders/${title.toLowerCase()}/`,
	items: [{ id: `${title.toLowerCase()}/page`, title: `${title} page`, href: `/${title.toLowerCase()}/page/` }],
	more: 0
});

const menu = ['Characters', 'Items', 'Mechanics', 'Places'].map(folder);

/** The bar inside a box `width` wide, on a page in Places. */
async function bar(width: string) {
	const host = document.createElement('div');
	host.style.inlineSize = width;
	host.style.blockSize = '3.5rem';
	document.body.replaceChildren(host);
	render(SectionBar, { target: host, props: { menu, currentPath: '/places/vessa/', currentFolders: ['places'] } });
	const sections = page.getByRole('navigation', { name: 'Sections' });
	return { sections, links: () => [...host.querySelectorAll('.bar:not(.probe) > .top:not(.more) > a')].map((a) => a.textContent) };
}

it('shows every section when they fit, without More', async () => {
	const { sections, links } = await bar('60rem');
	await expect.element(sections.getByRole('link', { name: 'Places', exact: true })).toBeVisible();
	expect(links()).toEqual(['Characters', 'Items', 'Mechanics', 'Places']);
	await expect.element(sections.getByRole('button', { name: 'More' })).not.toBeInTheDocument();
});

it('keeps the sections that do not fit in More, which marks the current one', async () => {
	const { sections, links } = await bar('14rem');
	const more = sections.getByRole('button', { name: 'More' });
	await expect.element(more).toBeVisible();
	expect(links().length).toBeLessThan(menu.length);
	await more.click();
	const waiting = menu.slice(links().length).map((section) => section.title);
	for (const title of waiting) await expect.element(sections.getByRole('link', { name: title, exact: true })).toBeVisible();
	await expect.element(sections.getByRole('link', { name: 'Places', exact: true })).toHaveStyle({ fontWeight: '600' });
});
