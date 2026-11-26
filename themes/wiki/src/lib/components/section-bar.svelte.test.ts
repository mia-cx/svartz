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
async function bar(width: string, folders = menu) {
	const host = document.createElement('div');
	host.style.inlineSize = width;
	host.style.blockSize = '3.5rem';
	document.body.replaceChildren(host);
	render(SectionBar, { target: host, props: { menu: folders, currentPath: '/places/vessa/', currentFolders: ['places'] } });
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
	// A section in More opens its pages in place, so a long More can scroll without cutting them off.
	await sections.getByRole('button', { name: 'Places pages' }).click();
	await expect.element(sections.getByRole('link', { name: 'Places page' })).toBeVisible();
});

it('shows every section when they fit exactly, even if More would be wider than the last one', async () => {
	const short = [...menu.slice(0, 3), folder('AI')];
	const { sections, links } = await bar('60rem', short);
	await expect.element(sections.getByRole('link', { name: 'AI', exact: true })).toBeVisible();
	// The sections' own width, measured from the bar's invisible copy, is all the room the bar gets.
	const probe = document.querySelector<HTMLElement>('.probe')!;
	const [more, ...widths] = [...probe.children].map((item) => (item as HTMLElement).offsetWidth);
	expect(widths.at(-1)).toBeLessThan(more!);
	const gap = parseFloat(getComputedStyle(probe).columnGap) || 0;
	const host = document.body.firstElementChild as HTMLElement;
	host.style.inlineSize = `${widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1)}px`;
	// Resize observers run before the next paint: two frames later the bar has fitted itself to the new width.
	await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	expect(links()).toEqual(['Characters', 'Items', 'Mechanics', 'AI']);
	await expect.element(sections.getByRole('button', { name: 'More' })).not.toBeInTheDocument();
});

/** Two frames: resize observers have run and the bar has re-rendered. */
const settled = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

it("never widens the page with its hidden copy of the sections, however many there are", async () => {
	const many = Array.from({ length: 15 }, (_, index) => folder(`Section with a long name ${index + 1}`));
	const { sections } = await bar('20rem', many);
	await expect.element(sections.getByRole('button', { name: 'More' })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});

it('moves focus to More when the focused section moves into it', async () => {
	const { sections } = await bar('60rem');
	const places = sections.getByRole('link', { name: 'Places', exact: true });
	await expect.element(places).toBeVisible();
	(places.element() as HTMLElement).focus();
	(document.body.firstElementChild as HTMLElement).style.inlineSize = '14rem';
	await settled();
	await settled();
	expect(document.activeElement).toBe(sections.getByRole('button', { name: 'More' }).element());
});
