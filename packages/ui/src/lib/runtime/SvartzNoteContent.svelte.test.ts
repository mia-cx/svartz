import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createProtectionSalt, deriveProtectionKey, sealProtectedPayload } from '@svartz/core';
import { afterEach, expect, it, vi } from 'vitest';
import SvartzNoteContent from './SvartzNoteContent.svelte';
import { noteStylesheets } from './note-stylesheets.js';
import { lockProtectedGroup } from './protected-client.js';
import HostCallout from './testing/HostCallout.svelte';

const groupId = 'vault:work:group:fixture';

afterEach(() => {
	lockProtectedGroup(groupId);
	vi.unstubAllGlobals();
});

it('renders a plain note body without the theme layout', async () => {
	for (const pathname of ['/work/plain/', '/work/plain']) {
		const { container } = render(SvartzNoteContent, { pathname, stylesheets: [] });
		await expect.element(page.getByText('Plain body')).toBeVisible();
		expect(container.textContent).not.toContain('THEME LAYOUT');
		container.remove();
	}
});

it('uses theme content components and lets host overrides win their slot', async () => {
	const theme = render(SvartzNoteContent, { pathname: '/work/callouts/', stylesheets: [] });
	await expect.element(page.getByText('Callout body')).toBeVisible();
	expect(theme.container.querySelector('[data-callout][data-owner="theme"]')).toBeTruthy();
	expect(theme.container.querySelector('[data-embed][data-owner="theme"]')).toBeTruthy();
	theme.unmount();

	const host = render(SvartzNoteContent, {
		pathname: '/work/callouts/',
		stylesheets: [],
		contentComponents: { callout: HostCallout }
	});
	await expect.element(page.getByText('Callout body')).toBeVisible();
	expect(host.container.querySelector('[data-callout][data-owner="host"]')).toBeTruthy();
	expect(host.container.querySelector('[data-callout][data-owner="theme"]')).toBeNull();
	expect(host.container.querySelector('[data-embed][data-owner="theme"]')).toBeTruthy();
});

it('shows the unlock form for a protected note inside the clarity mask', async () => {
	const { container } = render(SvartzNoteContent, {
		pathname: '/work/secret/',
		stylesheets: []
	});
	await expect.element(page.getByLabelText('Password')).toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Unlock note' })).toBeVisible();
	expect(
		container.querySelector('[data-clarity-mask="true"] form')
	).toBeTruthy();
	expect(container.textContent).not.toContain('Locked shell');
});

it('renders the decrypted note body after unlocking', async () => {
	const salt = createProtectionSalt();
	const key = await deriveProtectionKey('correct-password', salt);
	const payload = {
		version: 1,
		notes: [{ slug: 'secret', exportName: 'note0' }],
		entries: [],
		search: [],
		graph: {},
		js: "export function note0(anchor) { const p = document.createElement('p'); p.textContent = 'Unlocked body'; anchor.before(p); }",
		css: '',
		assets: [],
		bridgeImports: []
	};
	const envelope = await sealProtectedPayload(
		key,
		salt,
		groupId,
		new TextEncoder().encode(JSON.stringify(payload))
	);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 }))
	);

	render(SvartzNoteContent, { pathname: '/work/secret/', stylesheets: [] });
	await page.getByLabelText('Password').fill('correct-password');
	await page.getByRole('button', { name: 'Unlock note' }).click();
	await expect.element(page.getByRole('button', { name: 'Lock note' })).toBeVisible();
	expect(page.getByLabelText('Password').query()).toBeNull();
	await expect.element(page.getByText('Unlocked body')).toBeVisible();
});

it('renders nothing for non-note pathnames', async () => {
	for (const pathname of ['/work/tags/demo/', '/elsewhere/']) {
		const { container, unmount } = render(SvartzNoteContent, {
			pathname,
			stylesheets: ['/_app/immutable/assets/shared.css']
		});
		await Promise.resolve();
		expect(container.textContent?.trim() ?? '').toBe('');
		unmount();
	}
	expect(
		[...document.head.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
			link.getAttribute('href')
		)
	).toEqual([]);
});

it('links the stylesheets its route computed in load', async () => {
	// Production `hostStylesheets` is empty in the browser; page data carries the SSR
	// list through hydration, which is why the component takes it as a prop.
	expect(noteStylesheets('/work/callouts/')).toEqual([]);

	render(SvartzNoteContent, {
		pathname: '/work/callouts/',
		stylesheets: ['/_app/immutable/assets/shared.css', '/_app/immutable/assets/callouts.css']
	});
	await expect.element(page.getByText('Callout body')).toBeVisible();
	const hrefs = [...document.head.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
		link.getAttribute('href')
	);
	expect(hrefs).toContain('/_app/immutable/assets/shared.css');
	expect(hrefs).toContain('/_app/immutable/assets/callouts.css');
});
