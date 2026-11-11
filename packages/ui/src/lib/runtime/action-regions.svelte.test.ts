import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import {
	createProtectionSalt,
	deriveProtectionKey,
	mountBrowserScripts,
	sealProtectedPayload,
	type BrowserScriptModule
} from '@svartz/core';
import { afterEach, expect, it, vi } from 'vitest';
import '../styles/base.css';
import PageActions from '../PageActions.svelte';
import { lockProtectedGroup } from './protected-client.js';
import SvartzVaultPage from './SvartzVaultPage.svelte';
import RegionsLayout from './testing/RegionsLayout.svelte';
import { artifacts, theme } from './testing/host';

afterEach(() => {
	lockProtectedGroup('vault:work:group:fixture');
	vi.unstubAllGlobals();
});

const PAGE = '[data-svartz-region="page-actions"]';
const SITE = '[data-svartz-region="site-actions"]';

/** The plugin script #248 ships, reduced: Edit in page actions, New page in site actions, a global listener. */
function actionsPlugin() {
	const listening = new Set<() => void>();
	const script: BrowserScriptModule = {
		mount(pathname) {
			const button = (label: string) => Object.assign(document.createElement('button'), { type: 'button', textContent: label });
			const edit = button(`Edit ${pathname}`);
			const create = button('New page');
			document.querySelector(PAGE)?.append(edit);
			document.querySelector(SITE)?.append(create);
			const onKey = () => {};
			document.addEventListener('keydown', onKey);
			listening.add(onKey);
			return () => {
				edit.remove();
				create.remove();
				document.removeEventListener('keydown', onKey);
				listening.delete(onKey);
			};
		}
	};
	return { script, listening };
}

function renderVault(script: BrowserScriptModule, pathname: string) {
	const runtimeTheme = {
		...theme,
		theme: { ...theme.theme, layouts: { ...theme.theme.layouts, notePage: { default: RegionsLayout } } }
	};
	const runtimeArtifacts = {
		...artifacts,
		mountBrowserResources: (path: string) => mountBrowserScripts([{ id: 'actions', load: async () => script }], path)
	};
	return render(SvartzVaultPage, { pathname, runtimeTheme, artifacts: runtimeArtifacts } as never);
}

const labels = (selector: string) => [...document.querySelectorAll(selector)].flatMap((region) => [...region.children].map((child) => child.textContent));

it('mounts a plugin action in each region and moves it to the next page on navigation', async () => {
	const { script, listening } = actionsPlugin();
	const view = renderVault(script, '/work/plain/');

	await expect.element(page.getByRole('button', { name: 'Edit /work/plain/' })).toBeVisible();
	await expect.element(page.getByRole('button', { name: 'New page' })).toBeVisible();
	expect(document.querySelectorAll(PAGE)).toHaveLength(1);
	expect(document.querySelectorAll(SITE)).toHaveLength(1);

	await view.rerender({ pathname: '/work/callouts/' });
	await expect.element(page.getByRole('button', { name: 'Edit /work/callouts/' })).toBeVisible();
	expect(labels(PAGE)).toEqual(['Edit /work/callouts/']);
	expect(labels(SITE)).toEqual(['New page']);
	expect(listening.size).toBe(1);

	view.unmount();
	expect(listening.size).toBe(0);
});

it('leaves one mount for the last page after rapid navigation', async () => {
	const { script, listening } = actionsPlugin();
	const view = renderVault(script, '/work/plain/');
	void view.rerender({ pathname: '/work/callouts/' });
	void view.rerender({ pathname: '/work/secret/' });
	await view.rerender({ pathname: '/work/plain/' });

	await expect.poll(() => labels(PAGE)).toEqual(['Edit /work/plain/']);
	expect(labels(SITE)).toEqual(['New page']);
	expect(listening.size).toBe(1);
	view.unmount();
});

it('mounts page actions for a hidden note once it unlocks, and removes them when it locks', async () => {
	const groupId = 'vault:work:group:fixture';
	const hidden = { ...artifacts.index.entries[0]!, slug: 'hidden', href: '/work/hidden/', path: 'hidden.md', title: 'The hidden note' };
	const salt = createProtectionSalt();
	const key = await deriveProtectionKey('correct-password', salt);
	const payload = {
		version: 1,
		notes: [{ slug: 'hidden', exportName: 'note0' }],
		entries: [hidden],
		search: [],
		graph: {},
		js: 'export function note0() {}',
		css: '',
		assets: [],
		bridgeImports: []
	};
	const envelope = await sealProtectedPayload(key, salt, groupId, new TextEncoder().encode(JSON.stringify(payload)));
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 })));

	const { script, listening } = actionsPlugin();
	const view = renderVault(script, '/work/hidden/');
	await expect.element(page.getByLabelText('Password')).toBeVisible();
	expect(document.querySelector(PAGE)).toBeNull();

	await page.getByLabelText('Password').fill('correct-password');
	await page.getByRole('button', { name: 'Unlock note' }).click();
	await expect.element(page.getByRole('button', { name: 'Edit /work/hidden/' })).toBeVisible();
	expect(labels(SITE)).toEqual(['New page']);
	expect(listening.size).toBe(1);

	await page.getByRole('button', { name: 'Lock note' }).click();
	await expect.poll(() => document.querySelector(PAGE)).toBeNull();
	expect(labels(SITE)).toEqual(['New page']);
	expect(listening.size).toBe(1);
	view.unmount();
});

it('takes no space while a region is empty', async () => {
	const view = renderVault({ mount: () => {} }, '/work/plain/');
	await expect.element(page.getByRole('heading', { name: 'The plain note' })).toBeVisible();
	// The fixture notes have no Markdown copy, so the page-actions row is empty too.
	for (const selector of [PAGE, SITE, '.sv-page-actions']) {
		const element = document.querySelector<HTMLElement>(selector);
		expect(element, selector).not.toBeNull();
		expect(element!.checkVisibility(), selector).toBe(false);
	}
	view.unmount();
});

it('lines plugin page actions up after Copy page and View as Markdown', async () => {
	render(PageActions, { href: '/work/plain.md' });
	const edit = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Edit' });
	document.querySelector(PAGE)!.append(edit);

	await expect.element(page.getByRole('button', { name: 'Edit' })).toBeVisible();
	const row = document.querySelector('.sv-page-actions')!;
	expect([...row.querySelectorAll('a, button')].map((control) => control.textContent?.trim())).toEqual(['Copy page', 'View as Markdown', 'Edit']);
	// Same look as Copy page.
	const copy = page.getByRole('button', { name: 'Copy page' }).element();
	expect(getComputedStyle(edit).borderRadius).toBe(getComputedStyle(copy).borderRadius);
	expect(edit.getBoundingClientRect().top).toBe(copy.getBoundingClientRect().top);
});
